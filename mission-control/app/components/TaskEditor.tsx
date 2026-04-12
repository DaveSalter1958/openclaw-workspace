"use client";

import { useState, useTransition } from 'react';

type Task = {
  id: string;
  title: string;
  status: 'open' | 'done';
  priority: 'low' | 'medium' | 'high';
  domain?: string;
  dueDate?: string;
  dueTime?: string;
  project?: string;
  notes?: string;
  scope?: string;
};

export function TaskEditor({ initialTask, returnPath = '/mission-control' }: { initialTask: Task; returnPath?: string }) {
  const [task, setTask] = useState(initialTask);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function updateField<K extends keyof Task>(key: K, value: Task[K]) {
    setTask((current) => ({ ...current, [key]: value }));
  }

  function save(nextStatus?: 'open' | 'done') {
    startTransition(async () => {
      const response = await fetch(`/mission-control/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, status: nextStatus ?? task.status }),
      });
      if (!response.ok) {
        setMessage('Save failed.');
        return;
      }
      const data = await response.json();
      setTask(data.task);
      window.location.href = returnPath;
    });
  }

  function removeTask() {
    startTransition(async () => {
      const response = await fetch(`/mission-control/api/tasks/${task.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setMessage('Delete failed.');
        return;
      }
      window.location.href = returnPath;
    });
  }

  return (
    <section className="card">
      <div className="section-title">
        <div>
          <h2>Edit task</h2>
          <p className="muted small">Change fields, delete the task, or mark it complete.</p>
        </div>
      </div>

      <div className="form">
        <label>
          <span className="muted small">Title</span>
          <input className="input" value={task.title} onChange={(e) => updateField('title', e.target.value)} />
        </label>

        <div className="grid grid-3">
          <label>
            <span className="muted small">Priority</span>
            <select className="input" value={task.priority} onChange={(e) => updateField('priority', e.target.value as Task['priority'])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            <span className="muted small">Status</span>
            <select className="input" value={task.status} onChange={(e) => updateField('status', e.target.value as Task['status'])}>
              <option value="open">Open</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label>
            <span className="muted small">Scope</span>
            <input className="input" value={task.scope || ''} onChange={(e) => updateField('scope', e.target.value)} />
          </label>
        </div>

        <div className="grid grid-3">
          <label>
            <span className="muted small">Project</span>
            <input className="input" value={task.project || ''} onChange={(e) => updateField('project', e.target.value)} />
          </label>
          <label>
            <span className="muted small">Domain</span>
            <input className="input" value={task.domain || ''} onChange={(e) => updateField('domain', e.target.value)} />
          </label>
          <label>
            <span className="muted small">Due date</span>
            <input className="input" type="date" value={task.dueDate || ''} onChange={(e) => updateField('dueDate', e.target.value)} />
          </label>
        </div>

        <label>
          <span className="muted small">Due time</span>
          <input className="input" type="time" value={task.dueTime || ''} onChange={(e) => updateField('dueTime', e.target.value)} />
        </label>

        <label>
          <span className="muted small">Notes</span>
          <textarea className="input" rows={7} value={task.notes || ''} onChange={(e) => updateField('notes', e.target.value)} />
        </label>

        <div className="footer-actions">
          <button className="button" type="button" onClick={() => save()} disabled={isPending}>{isPending ? 'Saving…' : 'Save changes'}</button>
          <button className="button secondary" type="button" onClick={() => save('done')} disabled={isPending}>Mark completed</button>
          <button className="button danger" type="button" onClick={removeTask} disabled={isPending}>Delete task</button>
          {message ? <p className="muted small">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
