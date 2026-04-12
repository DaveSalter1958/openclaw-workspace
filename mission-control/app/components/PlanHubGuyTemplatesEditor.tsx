"use client";

import { useState } from 'react';

type TemplateMap = Record<string, { subject: string; body: string }>;

export function PlanHubGuyTemplatesEditor({ initialTemplates }: { initialTemplates: TemplateMap }) {
  const [templates, setTemplates] = useState<TemplateMap>(initialTemplates);
  const [status, setStatus] = useState('');
  const entries = Object.entries(templates);

  function updateTemplate(key: string, field: 'subject' | 'body', value: string) {
    setTemplates((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      },
    }));
  }

  async function save() {
    setStatus('Saving…');
    const res = await fetch('/mission-control/api/planhubguy/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templates),
    });
    if (!res.ok) {
      setStatus('Save failed.');
      return;
    }
    setStatus('Saved.');
  }

  async function reload() {
    setStatus('Reloading…');
    const res = await fetch('/mission-control/api/planhubguy/templates');
    const data = await res.json();
    setTemplates(data);
    setStatus('Reloaded from file.');
  }

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card hero" style={{ minHeight: 120 }}>
        <div className="kicker">PlanHubGuy</div>
        <h1>Templates</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>
          Edit the source templates PlanHubGuy uses for the initial outreach and follow-ups. Nothing should change unless you explicitly save here.
        </p>
      </section>

      {entries.map(([key, value]) => (
        <section className="card" key={key}>
          <div className="section-title">
            <div>
              <h2>{key}</h2>
              <p className="muted small">Use [Project Name] and {'{{ contact.firstname }}'} where needed.</p>
            </div>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <label className="muted small">
              Subject
              <textarea
                value={value.subject}
                onChange={(e) => updateTemplate(key, 'subject', e.target.value)}
                style={{ width: '100%', minHeight: 56, marginTop: 6 }}
              />
            </label>
            <label className="muted small">
              Body
              <textarea
                value={value.body}
                onChange={(e) => updateTemplate(key, 'body', e.target.value)}
                style={{ width: '100%', minHeight: 220, marginTop: 6 }}
              />
            </label>
          </div>
        </section>
      ))}

      <section className="card">
        <div className="clawhub-actions">
          <button className="reference-primary-button" type="button" onClick={save}>Save templates</button>
          <button className="mission-nav-link clawhub-button" type="button" onClick={reload}>Reload from file</button>
          <span className="muted small">{status}</span>
        </div>
      </section>
    </main>
  );
}
