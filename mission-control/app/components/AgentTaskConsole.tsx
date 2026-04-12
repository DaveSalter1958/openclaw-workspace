"use client";

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

type AgentTask = {
  id: string;
  title: string;
  dueLabel?: string;
  priority: 'low' | 'medium' | 'high';
  project: string;
  notes?: string;
};

type Props = {
  initialTasks: AgentTask[];
};

export function AgentTaskConsole({ initialTasks }: Props) {
  const [tasks, setTasks] = useState(initialTasks);
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [openTaskId, setOpenTaskId] = useState<string | null>(initialTasks[0]?.id ?? null);
  const [lastReply, setLastReply] = useState<string>('');

  const visibleTasks = useMemo(() => tasks.slice(0, 4), [tasks]);

  async function sendInstruction() {
    if (!input.trim()) return;
    const message = input.trim();
    setInput('');

    startTransition(async () => {
      const response = await fetch('/mission-control/api/guy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        setLastReply('That failed. The instruction did not make it into the agent task queue.');
        return;
      }

      const { task, reply } = await response.json();
      const localTask = {
        id: task.id,
        title: task.title,
        dueLabel: task.dueDate || '',
        priority: task.priority,
        project: task.project || 'Guy',
        notes: task.notes || '',
      };
      setTasks((current) => [localTask, ...current]);
      setOpenTaskId(task.id);
      setLastReply(reply);
    });
  }

  return (
    <main className="reference-dashboard">
      <section className="reference-header desktop-priority-header">
        <div className="reference-header-top">
          <div className="reference-title-pill">◇ Agent Tasks</div>
          <div className="reference-metrics">
            <div className="reference-metric"><strong>{tasks.length}</strong><span>Total agent tasks</span></div>
          </div>
        </div>
        <div className="task-legend" aria-label="Task priority legend">
          <span className="task-legend-label">Circle next to task name = priority:</span>
          <span className="task-legend-item"><i className="dot dot-amber" /> Amber = high priority</span>
          <span className="task-legend-item"><i className="dot dot-cyan" /> Cyan = medium priority</span>
          <span className="task-legend-item"><i className="dot dot-violet" /> Violet = low priority</span>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Send instructions</h2>
            <p className="muted small">Type requests here and they will be added as agent tasks.</p>
          </div>
        </div>
        <div className="form">
          <textarea
            className="input"
            rows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a request or instruction for Guy..."
          />
          <div className="agent-console-actions">
            <button className="button" type="button" onClick={sendInstruction} disabled={isPending || !input.trim()}>
              {isPending ? 'Sending…' : 'Add agent task'}
            </button>
            {lastReply ? <p className="muted small">{lastReply}</p> : null}
          </div>
        </div>
      </section>

      <section className="grid grid-2-1">
        <div>
          <div className="section-title">
            <div>
              <h2>Current work</h2>
              <p className="muted small">Click a task card to open the details.</p>
            </div>
          </div>
          <div className="agent-icon-grid">
            {visibleTasks.length > 0 ? visibleTasks.map((task) => {
              const accent = task.priority === 'high' ? 'amber' : task.priority === 'medium' ? 'cyan' : 'violet';
              const open = openTaskId === task.id;
              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}?from=agent-tasks`}
                  className={`agent-icon-card ${open ? 'open' : ''}`}
                  onClick={() => setOpenTaskId(task.id)}
                >
                  <span className={`agent-icon-badge dot dot-${accent}`} />
                  <strong>{task.title}</strong>
                  <span>{task.project}</span>
                </Link>
              );
            }) : <div className="reference-empty-card compact-empty">No current agent tasks</div>}
          </div>
        </div>

        <aside className="card">
          <div className="section-title">
            <div>
              <h2>Task details</h2>
              <p className="muted small">Open a task to inspect what Guy is working on.</p>
            </div>
          </div>
          {visibleTasks.find((task) => task.id === openTaskId) ? (() => {
            const task = visibleTasks.find((item) => item.id === openTaskId)!;
            return (
              <div className="grid" style={{ gap: 12 }}>
                <div>
                  <p className="eyebrow">Task</p>
                  <h3>{task.title}</h3>
                </div>
                <p className="muted small"><strong>Project</strong> — {task.project}</p>
                <p className="muted small"><strong>Priority</strong> — {task.priority}</p>
                {task.dueLabel ? <p className="muted small"><strong>Due</strong> — {task.dueLabel}</p> : null}
                <div>
                  <p className="eyebrow">Details</p>
                  <p className="body-copy">{task.notes || 'No extra details captured yet.'}</p>
                </div>
              </div>
            );
          })() : <p className="muted">Select a task card to see details.</p>}
        </aside>
      </section>
    </main>
  );
}
