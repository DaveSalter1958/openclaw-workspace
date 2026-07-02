#!/usr/bin/env python3
import os
import sys
import time
import wave
import io
import audioop
import tempfile
import subprocess
import threading
from collections import deque

import webrtcvad
import re

try:
    from openai import OpenAI
except Exception as e:
    print("Missing OpenAI client. Activate venv and `pip install openai`.")
    raise


# -------- Configuration --------
WAKE_PHRASE = "hey guy"
WAKE_PATTERNS = [
    re.compile(r"\bhey[, ]+guy\b"),
    re.compile(r"\bhi[, ]+guy\b"),
    re.compile(r"\bok(?:ay)?[, ]+guy\b"),
    re.compile(r"\bheyguys?\b"),
    re.compile(r"^guy\b"),
]
SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2  # 16-bit
FRAME_MS = 30  # VAD supported: 10/20/30ms
FRAME_BYTES = int(SAMPLE_RATE * (FRAME_MS/1000.0)) * SAMPLE_WIDTH

INPUT_DEVICE = os.environ.get("GUY_VOICE_INPUT", "plughw:2,0")   # arecord device (plughw safer)
OUTPUT_DEVICE = os.environ.get("GUY_VOICE_OUTPUT", "hw:0,0")  # aplay device

OPENAI_MODEL_CHAT = os.environ.get("GUY_VOICE_LLM", "gpt-4o-mini")
OPENAI_MODEL_STT = os.environ.get("GUY_VOICE_STT", "gpt-4o-mini-transcribe")
OPENAI_MODEL_TTS = os.environ.get("GUY_VOICE_TTS", "gpt-4o-mini-tts")
OPENAI_TTS_VOICE = os.environ.get("GUY_VOICE_TTS_VOICE", "alloy")
TTS_GAIN_DB = int(os.environ.get("GUY_VOICE_TTS_GAIN_DB", "6"))  # +6 dB by default

SYSTEM_PROMPT = (
    "You are Guy — a sharp technical partner: grounded, concise, and warm. "
    "Keep replies brief unless asked for depth."
)

VAD_LEVEL = int(os.environ.get("GUY_VOICE_VAD", "1"))  # 0=least aggressive, 3=most
MAX_SILENCE_MS = int(os.environ.get("GUY_VOICE_MAX_SILENCE_MS", "1200"))
DEBUG = os.environ.get("GUY_VOICE_DEBUG", "0") == "1"


def _apply_gain_to_wav(wav_bytes: bytes, gain_db: int) -> bytes:
    if not wav_bytes or not gain_db:
        return wav_bytes
    try:
        factor = 10.0 ** (gain_db / 20.0)
        src = io.BytesIO(wav_bytes)
        with wave.open(src, 'rb') as r:
            params = r.getparams()
            sampwidth = r.getsampwidth()
            frames = r.readframes(r.getnframes())
        if sampwidth not in (1, 2, 3, 4):
            return wav_bytes
        boosted = audioop.mul(frames, sampwidth, factor)
        dst = io.BytesIO()
        with wave.open(dst, 'wb') as w:
            w.setparams(params)
            w.writeframes(boosted)
        return dst.getvalue()
    except Exception:
        return wav_bytes


def synthesize_tts(text: str, client: OpenAI) -> bytes:
    # Request WAV so we can play via aplay directly
    resp = client.audio.speech.create(
        model=OPENAI_MODEL_TTS,
        voice=OPENAI_TTS_VOICE,
        input=text,
        response_format="wav",
    )
    audio = resp.read()
    return _apply_gain_to_wav(audio, TTS_GAIN_DB)


def transcribe_wav(wav_path: str, client: OpenAI) -> str:
    with open(wav_path, "rb") as f:
        tr = client.audio.transcriptions.create(
            model=OPENAI_MODEL_STT,
            file=f,
            # temperature low for accuracy
            temperature=0.0,
        )
    # API returns .text for Whisper-like, or .text on v1 lib
    text = getattr(tr, "text", None) or getattr(tr, "data", None)
    if isinstance(text, dict) and "text" in text:
        return text["text"]
    return str(text) if text is not None else ""


def chat_reply(text: str, client: OpenAI) -> str:
    # Use Responses API for simplicity
    resp = client.chat.completions.create(
        model=OPENAI_MODEL_CHAT,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0.3,
        max_tokens=300,
    )
    return resp.choices[0].message.content.strip()


def save_wav(path: str, pcm_bytes: bytes):
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(SAMPLE_WIDTH)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm_bytes)


def aplay_wav_bytes(wav_bytes: bytes):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(wav_bytes)
        tmp.flush()
        tmp_path = tmp.name
    try:
        subprocess.run([
            "aplay", "-q", "-D", OUTPUT_DEVICE, tmp_path
        ], check=False)
    finally:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass


def record_stream(stop_event: threading.Event):
    """
    Generator that yields 30ms PCM16 mono frames from arecord stdout.
    """
    cmd = [
        "arecord",
        "-q",
        "-D", INPUT_DEVICE,
        "-f", "S16_LE",
        "-c", str(CHANNELS),
        "-r", str(SAMPLE_RATE),
        "-t", "raw",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)

    try:
        while not stop_event.is_set():
            chunk = proc.stdout.read(FRAME_BYTES)
            if not chunk or len(chunk) < FRAME_BYTES:
                break
            yield chunk
    finally:
        try:
            proc.terminate()
        except Exception:
            pass
        try:
            proc.wait(timeout=1)
        except Exception:
            pass


def main():
    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY not set. Export it and restart.")
        sys.exit(1)

    client = OpenAI()

    vad = webrtcvad.Vad(max(0, min(3, VAD_LEVEL)))  # 0-3 (3 is most aggressive)
    max_silence_ms = MAX_SILENCE_MS
    max_silence_frames = max(1, int(max_silence_ms / FRAME_MS))

    ring = deque(maxlen=int(1000 / FRAME_MS))  # ~1s for padding
    voiced_pcm = bytearray()
    in_voice = False
    silence_run = 0

    stop_event = threading.Event()

    # Startup chime
    try:
        hello = synthesize_tts("Voice assistant ready.", client)
        aplay_wav_bytes(hello)
    except Exception:
        pass

    print(f"Listening on {INPUT_DEVICE} — say '{WAKE_PHRASE.title()}'.")

    try:
        for frame in record_stream(stop_event):
            # VAD expects 16-bit mono PCM @ 8/16/32/48k with 10/20/30ms frames
            is_speech = vad.is_speech(frame, SAMPLE_RATE)
            ring.append(frame)

            if is_speech:
                if not in_voice:
                    in_voice = True
                    silence_run = 0
                    # prepend padding (~1s)
                    for f in ring:
                        voiced_pcm.extend(f)
                else:
                    silence_run = 0
                voiced_pcm.extend(frame)
            else:
                if in_voice:
                    silence_run += 1
                    if silence_run >= max_silence_frames:
                        # utterance ended
                        in_voice = False
                        silence_run = 0

                        # write wav
                        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tf:
                            wav_path = tf.name
                        save_wav(wav_path, bytes(voiced_pcm))
                        voiced_pcm = bytearray()

                        # Transcribe
                        try:
                            text = transcribe_wav(wav_path, client)
                        finally:
                            try:
                                os.unlink(wav_path)
                            except FileNotFoundError:
                                pass

                        if not text:
                            continue

                        lower = text.lower().strip()
                        if DEBUG:
                            print("[voice] transcript:", lower)
                        matched = None
                        for pat in WAKE_PATTERNS:
                            m = pat.search(lower)
                            if m:
                                matched = m
                                break
                        if matched or (WAKE_PHRASE in lower):
                            start = matched.end() if matched else lower.find(WAKE_PHRASE) + len(WAKE_PHRASE)
                            user_text = text[start:].lstrip(' ,:;.-')
                            if not user_text:
                                user_text = "hello"

                            # Chat
                            try:
                                reply = chat_reply(user_text, client)
                            except Exception as e:
                                reply = "Sorry, I hit a snag talking to the model."

                            # TTS
                            try:
                                audio = synthesize_tts(reply, client)
                                aplay_wav_bytes(audio)
                            except Exception as e:
                                print("TTS/playback error:", e)
                                # fallback: print text
                                print("Guy:", reply)
                        elif DEBUG:
                            print("[voice] no wake phrase detected")
                        else:
                            # Not addressed to us; ignore
                            pass
                else:
                    # idle, nothing to do
                    pass
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()


if __name__ == "__main__":
    main()
