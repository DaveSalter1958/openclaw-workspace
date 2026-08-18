"use client";

import { useMemo, useState, useTransition } from 'react';
import type { WoodsDriveAction } from '@/lib/woods-drive';

function newAction(): WoodsDriveAction {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `woods-action-${Date.now()}`;
  return {
    id,
    sourceId: '',
    phase: '',
    text: '',
    dueDate: '',
    responsible: '',
    priority: 'Medium',
    status: 'Open',
    notes: '',
    done: false,
  };
}

export function WoodsDriveChecklist({ initialActions }: { initialActions: WoodsDriveAction[] }) {
  const [actions, setActions] = useState<WoodsDriveAction[]>(initialActions);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const openCount = useMemo(() => actions.filter((action) => !action.done).length, [actions]);

  function updateAction(id: string, patch: Partial<WoodsDriveAction>) {
    setActions((current) => current.map((action) => action.id === id ? { ...action, ...patch } : action));
  }

  function removeAction(id: string) {
    setActions((current) => current.filter((action) => action.id !== id));
  }

  function saveActions(nextActions = actions) {
    setMessage('');
    startTransition(async () => {
      const response = await fetch('/mission-control/api/woods-drive/checklist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: nextActions }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || 'Could not save Woods Drive actions.');
        return;
      }

      setActions(data.actions || []);
      setMessage('Saved.');
    });
  }

  return (
    <section className="card woods-checklist-card">
      <div className="section-title woods-section-title">
        <div>
          <h2>Action checklist</h2>
          <p className="muted small">{openCount} open / {actions.length} total</p>
        </div>
        <div className="footer-actions">
          <button className="button secondary" type="button" onClick={() => setActions((current) => [...current, newAction()])}>
            + Add action
          </button>
          <button className="button" type="button" onClick={() => saveActions()} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="woods-action-list">
        {actions.length ? actions.map((action) => (
          <article className={`woods-action-row ${action.done ? 'is-done' : ''}`} key={action.id}>
            <div className="woods-action-meta-row">
              <label className="woods-action-done">
                <input
                  checked={action.done}
                  type="checkbox"
                  onChange={(event) => updateAction(action.id, { done: event.target.checked, status: event.target.checked ? 'Done' : action.status || 'Open' })}
                />
                <span>{action.done ? 'Done' : 'Open'}</span>
              </label>
              <label>
                <span className="muted small">ID</span>
                <input className="input" value={action.sourceId} onChange={(event) => updateAction(action.id, { sourceId: event.target.value })} placeholder="PM-###" />
              </label>
              <label>
                <span className="muted small">Phase</span>
                <input className="input" value={action.phase} onChange={(event) => updateAction(action.id, { phase: event.target.value })} placeholder="Phase" />
              </label>
              <label>
                <span className="muted small">Priority</span>
                <select className="input" value={action.priority} onChange={(event) => updateAction(action.id, { priority: event.target.value })}>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                  <option value="">Unassigned</option>
                </select>
              </label>
              <label>
                <span className="muted small">Status</span>
                <input className="input" value={action.status} onChange={(event) => updateAction(action.id, { status: event.target.value })} placeholder="Open" />
              </label>
            </div>

            <div className="woods-action-main-row">
              <label className="woods-action-main-text">
                <span className="muted small">Action</span>
                <textarea
                  className="input woods-action-text"
                  rows={3}
                  value={action.text}
                  onChange={(event) => updateAction(action.id, { text: event.target.value })}
                  placeholder="Describe the action"
                />
              </label>

              <label>
                <span className="muted small">Due by</span>
                <input
                  className="input"
                  value={action.dueDate}
                  onChange={(event) => updateAction(action.id, { dueDate: event.target.value })}
                  placeholder="ASAP or YYYY-MM-DD"
                />
              </label>

              <label>
                <span className="muted small">Responsible</span>
                <input
                  className="input"
                  value={action.responsible}
                  onChange={(event) => updateAction(action.id, { responsible: event.target.value })}
                  placeholder="Person responsible"
                />
              </label>
            </div>

            <label>
              <span className="muted small">Notes</span>
              <textarea
                className="input woods-action-notes"
                rows={2}
                value={action.notes}
                onChange={(event) => updateAction(action.id, { notes: event.target.value })}
                placeholder="Supporting notes"
              />
            </label>

            <div className="woods-action-row-footer">
              <button className="compact-task-button delete woods-remove-action" type="button" onClick={() => removeAction(action.id)}>
                Remove
              </button>
            </div>
          </article>
        )) : (
          <div className="reference-empty-card compact-empty">
            Add the first Woods Drive action when you are ready.
          </div>
        )}
      </div>

      {message ? <p className="muted small woods-save-message">{message}</p> : null}
    </section>
  );
}
