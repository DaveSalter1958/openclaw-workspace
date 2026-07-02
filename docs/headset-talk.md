# Headset Talk — NUBWO HW02 on Raspberry Pi

Push-to-talk prototype for speaking with Guy through the USB headset attached to the Pi.

## Run

```bash
cd ~/.openclaw/workspace
bin/headset-talk
```

- Press Enter to start recording.
- Speak into the headset.
- Press Enter again to stop and send.
- Type `q` then Enter to quit.

## Current audio device

The Pi currently exposes the headset as:

- Mic: `alsa_input.usb-Generalplus_Usb_Audio_Device-00.mono-fallback`
- Speaker: `alsa_output.usb-Generalplus_Usb_Audio_Device-00.analog-stereo`

PipeWire/PulseAudio already has the headset set as the default source and sink, so playback should route to the headset.

## Useful overrides

```bash
HEADSET_TALK_SESSION=main bin/headset-talk
HEADSET_TALK_STT_MODEL=openai/gpt-4o-transcribe bin/headset-talk
HEADSET_TALK_TTS_MODEL=openai/gpt-4o-mini-tts bin/headset-talk
HEADSET_TALK_VOICE=onyx bin/headset-talk
HEADSET_TALK_KEEP_AUDIO=1 bin/headset-talk
```

## Notes

This is intentionally push-to-talk first. Hands-free silence detection and wake-word listening should come later, after this path is proven reliable.

## Auto-stop mode

Once the basic push-to-talk script works, use:

```bash
cd ~/.openclaw/workspace
bin/headset-talk-auto
```

- Press Enter to arm listening.
- Start speaking within about 10 seconds.
- Stop talking; after about 1.2 seconds of silence, it sends automatically.
- Type `q` then Enter to quit.

Tuning knobs:

```bash
HEADSET_TALK_SILENCE_SECONDS=1.6 bin/headset-talk-auto
HEADSET_TALK_START_RMS=600 bin/headset-talk-auto
HEADSET_TALK_STOP_RMS=350 bin/headset-talk-auto
HEADSET_TALK_MAX_SECONDS=60 bin/headset-talk-auto
```

If it cuts you off, increase `HEADSET_TALK_SILENCE_SECONDS`. If it triggers from room noise, increase the RMS thresholds.

## Wake-word-ish mode

After auto-stop mode is reliable, try:

```bash
cd ~/.openclaw/workspace
bin/headset-talk-wake
```

This continuously listens locally for voice activity, records each spoken utterance, transcribes it, and only sends it to Guy if the transcript starts with the wake word.

Examples:

- `Guy, what time is my next meeting?`
- `Hey Guy, summarize what we just did.`
- `Guy stop listening` — exits wake mode

Default wake word is `Guy`. Override it with:

```bash
HEADSET_TALK_WAKE_WORD=Willy bin/headset-talk-wake
```

Privacy note: this is not a hardware/offline wake-word engine. It uses local voice-activity detection, then sends each detected utterance for transcription so it can decide whether the wake word was said. For a stricter privacy model, keep using `bin/headset-talk-auto` or install a true offline wake-word engine later.

Useful tuning is the same as auto mode:

```bash
HEADSET_TALK_SILENCE_SECONDS=1.6 bin/headset-talk-wake
HEADSET_TALK_START_RMS=700 HEADSET_TALK_STOP_RMS=450 bin/headset-talk-wake
```

## Latency tuning

The auto and wake scripts are now tuned for lower latency by default:

- silence stop lowered from `1.2s` to `0.6s`
- max utterance lowered from `45s` to `30s`
- agent thinking forced to `off`
- timing output added for transcription, reply generation, and speech playback

Fastest normal run:

```bash
bin/headset-talk-auto
```

If it cuts you off, increase silence slightly:

```bash
HEADSET_TALK_SILENCE_SECONDS=1.0 bin/headset-talk-auto
```

Optional model overrides exist via `HEADSET_TALK_AGENT_MODEL`, but the gateway may reject unapproved models. Leave it unset unless you are deliberately testing model routing.

Example, if authorized in config:

```bash
HEADSET_TALK_AGENT_MODEL=openai/gpt-5 bin/headset-talk-auto
```

Remaining latency comes mostly from cloud transcription, the LLM turn, and generating the complete TTS audio before playback. A truly natural conversation loop would need streaming STT + streaming LLM + streaming TTS, or a dedicated realtime voice API.

## Realtime streaming mode

For the most natural conversation loop, use the realtime speech-to-speech script:

```bash
cd ~/.openclaw/workspace
bin/headset-talk-realtime
```

What this changes:

- Streams microphone audio continuously to OpenAI Realtime.
- Uses server-side VAD/turn detection instead of waiting for a completed WAV file.
- Streams assistant audio back while it is being generated.
- Supports basic barge-in: if you start talking while Guy is speaking, it attempts to cancel the response and drop queued playback.

Defaults:

- Model: `gpt-realtime-2`
- Voice: `echo`
- Audio: 24 kHz mono PCM
- Input: NUBWO USB mic source detected earlier
- Output: default PulseAudio/PipeWire sink, currently the NUBWO headset

Useful overrides:

```bash
HEADSET_REALTIME_VOICE=echo bin/headset-talk-realtime
HEADSET_REALTIME_MODEL=gpt-realtime bin/headset-talk-realtime
HEADSET_REALTIME_VAD=server_vad HEADSET_REALTIME_SILENCE_MS=350 bin/headset-talk-realtime
HEADSET_REALTIME_DEBUG=1 bin/headset-talk-realtime
```

Caveat: this talks directly to the OpenAI realtime model. It is much faster and more natural, but it does **not** currently route through the full OpenClaw agent/tool/memory stack. Treat it as the low-latency conversational mode, not the fully tooled assistant mode.

If `OPENAI_API_KEY is not set`, run it from a shell where the OpenAI key is exported.

### If your terminal says `OPENAI_API_KEY is not set`

Use the launcher that borrows the key from the running OpenClaw service environment without printing or saving it:

```bash
cd ~/.openclaw/workspace
bin/headset-talk-realtime-with-env
```

This is the preferred Pi-terminal command when your shell does not have `OPENAI_API_KEY` exported.
