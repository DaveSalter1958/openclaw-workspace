"use client";

import { useState, useTransition } from 'react';

type Props = {
  activeTaskTitle?: string;
};

export function WillyConsole({ activeTaskTitle }: Props) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function assignWork() {
    if (!title.trim()) return;

    startTransition(async () => {
      const response = await fetch('/api/willy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim(),
          priority: 'high',
          domain: 'review',
          project: 'Guy',
        }),
      });

      if (!response.ok) return;
      const { task } = await response.json();
      setCreated(task.title);
      setTitle('');
      setNotes('');
    });
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <div className="section-title">
          <div>
            <h2>Assign Guy work</h2>
            <p className="muted small">Create a real task in Second Brain without leaving Mission Control.</p>
          </div>
        </div>
        <div className="form">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you want Willy to work on?" />
          <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes, context, or constraints" />
          <button className="button" type="button" onClick={assignWork} disabled={isPending || !title.trim()}>
            {isPending ? 'Assigning…' : 'Assign task to Guy'}
          </button>
          {created ? <p className="muted small">Created task: <strong>{created}</strong></p> : null}
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Current active task</p>
        <h2>{activeTaskTitle ?? 'No open Willy task surfaced'}</h2>
        <p className="muted small">This comes from the current open task queue in Second Brain.</p>
      </section>
    </div>
  );
}
