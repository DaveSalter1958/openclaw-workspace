"use client";

import { useMemo, useState, useTransition } from 'react';

type VideoItem = {
  name: string;
  size: number;
  updatedAt: string;
  url: string;
  title: string;
  category: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RemotionConsole({ initialVideos }: { initialVideos: VideoItem[] }) {
  const [videos, setVideos] = useState(initialVideos);
  const [selectedName, setSelectedName] = useState(initialVideos[0]?.name ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(() => videos.find((video) => video.name === selectedName) ?? videos[0] ?? null, [videos, selectedName]);

  async function handleAction(action: 'archive' | 'delete' | 'deliver', name: string) {
    startTransition(async () => {
      const response = await fetch('/api/remotion/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name }),
      });

      const payload = await response.json().catch(() => ({}));

      if (action === 'deliver') {
        setMessage(payload.message || 'Delivery is not available yet.');
        return;
      }

      if (!response.ok) {
        setMessage(payload.error || 'Action failed.');
        return;
      }

      setVideos((current) => current.filter((video) => video.name !== name));
      setSelectedName((current) => (current === name ? '' : current));
      setMessage(action === 'archive' ? 'Video archived.' : 'Video moved to trash.');
    });
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="grid grid-2-1">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Primary viewport</h2>
              <p className="muted small">Latest or selected render ready for review.</p>
            </div>
          </div>
          {selected ? (
            <div className="grid" style={{ gap: 14 }}>
              <div className="video-frame">
                <video controls style={{ width: '100%', borderRadius: 16 }} src={selected.url} />
              </div>
              <div className="item mission-readout">
                <div className="item-top">
                  <div>
                    <h3>{selected.title}</h3>
                    <p className="muted small">{selected.category} · {new Date(selected.updatedAt).toLocaleString()}</p>
                  </div>
                  <span className="tag">Selected</span>
                </div>
                <p className="muted small">Filename: {selected.name}</p>
                <p className="muted small">Payload size: {formatBytes(selected.size)}</p>
                <div className="badge-row">
                  <a className="button secondary" href={selected.url} target="_blank" rel="noreferrer">Open file</a>
                  <button className="button secondary" type="button" onClick={() => handleAction('deliver', selected.name)} disabled={isPending}>Send to Dave</button>
                  <button className="button secondary" type="button" onClick={() => handleAction('archive', selected.name)} disabled={isPending}>Archive</button>
                  <button className="button secondary" type="button" onClick={() => handleAction('delete', selected.name)} disabled={isPending}>Delete</button>
                </div>
                {message ? <p className="muted small">{message}</p> : null}
              </div>
            </div>
          ) : (
            <p className="muted">No rendered videos found yet.</p>
          )}
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="card mission-stat-card">
            <p className="eyebrow">Render count</p>
            <h2>{videos.length}</h2>
            <p className="muted small">Visible video outputs in the delivery bay.</p>
          </div>
          <div className="card mission-stat-card">
            <p className="eyebrow">Delivery mode</p>
            <h2>Mission Control primary</h2>
            <p className="muted small">Attachment email is not solved, so this console remains the main delivery surface.</p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Render library</h2>
            <p className="muted small">Thumbnail cards with metadata and actions.</p>
          </div>
        </div>
        <div className="render-grid">
          {videos.length > 0 ? videos.map((video, index) => (
            <article className={`render-card ${selected?.name === video.name ? 'render-card-active' : ''}`} key={video.name}>
              <button className="render-select" type="button" onClick={() => setSelectedName(video.name)}>
                <video muted playsInline preload="metadata" className="render-thumb" src={video.url} />
                <div className="render-meta">
                  <div className="item-top">
                    <div>
                      <h3>{video.title}</h3>
                      <p className="muted small">{video.category}</p>
                    </div>
                    <div className="badge-row">
                      {index === 0 ? <span className="tag">Latest</span> : null}
                    </div>
                  </div>
                  <p className="muted small">{video.name}</p>
                  <p className="muted small">{formatBytes(video.size)} · {new Date(video.updatedAt).toLocaleString()}</p>
                </div>
              </button>
              <div className="badge-row">
                <a className="button secondary" href={video.url} target="_blank" rel="noreferrer">Open</a>
                <button className="button secondary" type="button" onClick={() => handleAction('archive', video.name)} disabled={isPending}>Archive</button>
                <button className="button secondary" type="button" onClick={() => handleAction('delete', video.name)} disabled={isPending}>Delete</button>
              </div>
            </article>
          )) : <p className="muted">No rendered videos found yet.</p>}
        </div>
      </section>
    </div>
  );
}
