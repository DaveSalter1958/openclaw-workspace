"use client";

import { useState, useTransition } from 'react';
import { ProjectSelect } from '@/app/components/ProjectSelect';

type TaskDraft = {
  title: string;
  priority: 'low' | 'medium' | 'high';
  scope: string;
  project: string;
  domain: string;
  dueDate: string;
  dueTime: string;
  notes: string;
};

const initialDraft: TaskDraft = {
  title: '',
  priority: 'medium',
  scope: '',
  project: '',
  domain: '',
  dueDate: '',
  dueTime: '17:00',
  notes: '',
};

export function NewTaskForm() {
  const [task, setTask] = useState<TaskDraft>(initialDraft);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function updateField<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setTask((current) => ({ ...current, [key]: value }));
  }

  function createTask() {
    if (!task.title.trim()) {
      setMessage('Title is required.');
      return;
    }

    startTransition(async () => {
      const response = await fetch('/mission-control/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessage(data.error || 'Create task failed.');
        return;
      }

      const data = await response.json();
      window.location.href = `/mission-control/tasks/${data.task.id}?from=tasks`;
    });
  }

  return (
    <section className="card">
      <div className="section-title">
        <div>
          <h2>New task</h2>
          <p className="muted small">Create a regular Mission Control task without going through chat.</p>
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
            <select className="input" value={task.priority} onChange={(e) => updateField('priority', e.target.value as TaskDraft['priority'])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            <span className="muted small">Scope</span>
            <input className="input" value={task.scope} onChange={(e) => updateField('scope', e.target.value)} />
          </label>
          <label>
            <span className="muted small">Project reference</span>
            <ProjectSelect value={task.project} onChange={(value) => updateField('project', value)} />
          </label>
        </div>

        <div className="grid grid-3">
          <label>
            <span className="muted small">Domain</span>
            <input className="input" value={task.domain} onChange={(e) => updateField('domain', e.target.value)} />
          </label>
          <label>
            <span className="muted small">Due date</span>
            <input className="input" type="date" value={task.dueDate} onChange={(e) => updateField('dueDate', e.target.value)} />
          </label>
          <label>
            <span className="muted small">Due time</span>
            <input className="input" type="time" value={task.dueTime} onChange={(e) => updateField('dueTime', e.target.value)} />
          </label>
        </div>

        <label>
          <span className="muted small">Notes</span>
          <textarea className="input" rows={7} value={task.notes} onChange={(e) => updateField('notes', e.target.value)} />
        </label>

        <div className="footer-actions">
          <button className="button" type="button" onClick={createTask} disabled={isPending}>
            {isPending ? 'Creating…' : 'Create task'}
          </button>
          {message ? <p className="muted small">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
