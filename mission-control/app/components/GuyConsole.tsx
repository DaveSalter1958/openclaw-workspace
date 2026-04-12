"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

type Props = {
  activeTaskTitle?: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  at: string;
};

const STORAGE_KEY = 'mission-control-guy-thread';

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function GuyConsole({ activeTaskTitle }: Props) {
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const recognitionRef = useRef<any>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const speechSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {}

    setMessages([
      {
        role: 'assistant',
        text: activeTaskTitle
          ? `Morning. Current active task: ${activeTaskTitle}. Tell me what you need.`
          : 'Morning. Tell me what you need.',
        at: new Date().toISOString(),
      },
    ]);
  }, [activeTaskTitle]);

  useEffect(() => {
    if (typeof window === 'undefined' || messages.length === 0) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (!speechSupported || recognitionRef.current || typeof window === 'undefined') return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript.trim());
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
  }, [speechSupported]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  function toggleListening() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }
    setIsListening(true);
    recognition.start();
  }

  async function sendInstruction() {
    if (!input.trim()) return;
    const text = input.trim();
    const now = new Date().toISOString();
    setMessages((current) => [...current, { role: 'user', text, at: now }]);
    setInput('');

    startTransition(async () => {
      // Snapshot current messages to pass as history
      setMessages((current) => {
        const history = current.map((m) => ({ role: m.role, content: m.text }));
        fetch('/mission-control/api/guy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, messages: history }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const err = await response.text();
              console.error('Guy API error', response.status, err);
              setMessages((prev) => [...prev, { role: 'assistant', text: `Error ${response.status} — try again.`, at: new Date().toISOString() }]);
              return;
            }
            const data = await response.json();
            const reply = data.reply ?? 'No response.';
            setMessages((prev) => [...prev, { role: 'assistant', text: reply, at: new Date().toISOString() }]);
          })
          .catch((err) => {
            console.error('Guy fetch failed', err);
            setMessages((prev) => [...prev, { role: 'assistant', text: 'Could not reach Guy. Check connection.', at: new Date().toISOString() }]);
          });
        return current;
      });
    });
  }

  function onComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendInstruction();
    }
  }

  return (
    <section className="guy-chat-app-shell">
      <header className="guy-chat-app-header">
        <div className="guy-chat-app-header-main">
          <div className="guy-chat-app-avatar">G</div>
          <div className="guy-chat-app-header-copy">
            <strong>Guy</strong>
            <span>online</span>
          </div>
        </div>
        <button
          className="guy-chat-app-clear"
          type="button"
          onClick={() => {
            const fresh = [{ role: 'assistant' as const, text: 'Morning. Tell me what you need.', at: new Date().toISOString() }];
            setMessages(fresh);
            try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch {}
          }}
        >
          Clear
        </button>
      </header>

      <div className="guy-chat-app-log" ref={logRef}>
        <div className="guy-chat-app-log-inner">
          {messages.map((message, index) => {
            const previous = index > 0 ? messages[index - 1] : null;
            const grouped = previous?.role === message.role;
            return (
              <div key={`${message.role}-${index}-${message.at}`} className={`guy-chat-row ${message.role} ${grouped ? 'grouped' : ''}`}>
                <article className={`guy-chat-bubble-app ${message.role}`}>
                  <p>{message.text}</p>
                  <div className="guy-chat-meta">{formatTime(message.at)}</div>
                </article>
              </div>
            );
          })}
        </div>
      </div>

      <footer className="guy-chat-app-composer">
        <button
          className="guy-chat-app-icon"
          type="button"
          onClick={toggleListening}
          disabled={!speechSupported}
          title={speechSupported ? 'Dictate message' : 'Speech input unavailable'}
        >
          {speechSupported ? (isListening ? '■' : '🎤') : '—'}
        </button>
        <textarea
          className="guy-chat-app-input"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="Message Guy"
        />
        <button className="guy-chat-app-send" type="button" onClick={sendInstruction} disabled={isPending || !input.trim()}>
          {isPending ? '…' : '➤'}
        </button>
      </footer>
    </section>
  );
}
