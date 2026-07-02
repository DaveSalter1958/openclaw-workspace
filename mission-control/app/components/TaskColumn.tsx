"use client";

import Link from 'next/link';
import { useState } from 'react';
import type { TaskBoardItem } from '@/lib/types';

export function TaskColumn({ title, emptyLabel, items }: { title: string; emptyLabel: string; items: TaskBoardItem[] }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const visibleItems = items.filter((item) => !hiddenIds.has(item.id));

  function setBusy(id: string, busy: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function completeTask(item: TaskBoardItem) {
    setError('');
    setBusy(item.id, true);
    const response = await fetch(`/mission-control/api/tasks/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    setBusy(item.id, false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'Could not mark task completed.');
      return;
    }
    setHiddenIds((current) => new Set([...current, item.id]));
  }

  async function deleteTask(item: TaskBoardItem) {
    if (!window.confirm(`Delete task: ${item.title}?`)) return;
    setError('');
    setBusy(item.id, true);
    const response = await fetch(`/mission-control/api/tasks/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    setBusy(item.id, false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'Could not delete task.');
      return;
    }
    setHiddenIds((current) => new Set([...current, item.id]));
  }

  return (
    <div className="reference-column compact-task-column">
      <div className="reference-column-head">
        <span className="reference-column-label">{title}</span>
        <span>{visibleItems.length}</span>
      </div>
      <div className="reference-card-stack compact-task-stack">
        {visibleItems.length > 0 ? visibleItems.map((item) => {
          const busy = busyIds.has(item.id);
          return (
            <article className="compact-task-row" key={item.id}>
              <span className="compact-task-title" title={item.title}>{item.title}</span>
              <div className="compact-task-actions">
                <Link className="compact-task-button edit" href={`/tasks/${encodeURIComponent(item.id)}`}>Edit</Link>
                <button className="compact-task-button done" type="button" disabled={busy} onClick={() => completeTask(item)}>Done</button>
                <button className="compact-task-button delete" type="button" disabled={busy} onClick={() => deleteTask(item)}>Delete</button>
              </div>
            </article>
          );
        }) : <div className="reference-empty-card compact-empty compact-task-empty">{emptyLabel}</div>}
        {error ? <p className="muted small compact-task-error">{error}</p> : null}
      </div>
    </div>
  );
}
