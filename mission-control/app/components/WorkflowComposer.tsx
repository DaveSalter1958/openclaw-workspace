"use client";

import { useState, useTransition } from 'react';
import type { ModuleDefinition, WorkflowDefinition, WorkflowStatus } from '@/lib/types';

type Props = {
  initialModules: ModuleDefinition[];
  initialWorkflows: WorkflowDefinition[];
};

export function WorkflowComposer({ initialModules, initialWorkflows }: Props) {
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: '',
    owner: 'Dave',
    goal: '',
    trigger: '',
    status: 'draft' as WorkflowStatus,
    steps: '',
  });

  function toggleModule(id: string) {
    setSelectedModules((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function moduleName(id: string) {
    return initialModules.find((module) => module.id === id)?.name ?? id;
  }

  async function createWorkflow() {
    startTransition(async () => {
      const response = await fetch('/api/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'workflow',
          ...form,
          steps: form.steps.split(',').map((step) => step.trim()).filter(Boolean),
          moduleIds: selectedModules,
        }),
      });

      if (!response.ok) return;

      const { item } = await response.json();
      setWorkflows((current) => [item, ...current]);
      setForm({ name: '', owner: 'Dave', goal: '', trigger: '', status: 'draft', steps: '' });
      setSelectedModules([]);
    });
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="card">
        <div className="section-title">
          <div>
            <h2>Workflow composer</h2>
            <p className="muted small">Pick modules, define trigger and goal, then create a real workflow spec.</p>
          </div>
        </div>

        <div className="form">
          <input className="input" placeholder="Workflow name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} />
          <input className="input" placeholder="Owner" value={form.owner} onChange={(e) => setForm((c) => ({ ...c, owner: e.target.value }))} />
          <select className="select" value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value as WorkflowStatus }))}>
            <option value="draft">draft</option>
            <option value="active">active</option>
          </select>
          <textarea className="input" rows={3} placeholder="Goal" value={form.goal} onChange={(e) => setForm((c) => ({ ...c, goal: e.target.value }))} />
          <textarea className="input" rows={2} placeholder="Trigger" value={form.trigger} onChange={(e) => setForm((c) => ({ ...c, trigger: e.target.value }))} />
          <input className="input" placeholder="Steps comma-separated" value={form.steps} onChange={(e) => setForm((c) => ({ ...c, steps: e.target.value }))} />

          <div className="section-title" style={{ marginBottom: 8 }}>
            <div>
              <h3>Attach modules</h3>
              <p className="muted small">Select the building blocks this workflow depends on.</p>
            </div>
          </div>
          <div className="badge-row">
            {initialModules.map((module) => {
              const active = selectedModules.includes(module.id);
              return (
                <button
                  key={module.id}
                  type="button"
                  className={`button secondary ${active ? 'active-pill' : ''}`}
                  onClick={() => toggleModule(module.id)}
                >
                  {module.name}
                </button>
              );
            })}
          </div>

          <button className="button" type="button" onClick={createWorkflow} disabled={isPending || !form.name || !form.goal || !form.trigger}>
            {isPending ? 'Saving…' : 'Create workflow'}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Workflow registry</h2>
            <p className="muted small">Created workflows with attached modules.</p>
          </div>
        </div>
        <div className="list">
          {workflows.map((workflow) => (
            <article className="item" key={workflow.id}>
              <div className="item-top">
                <div>
                  <h3>{workflow.name}</h3>
                  <p className="muted small">{workflow.status} · {workflow.owner}</p>
                </div>
                <span className={`status-pill ${workflow.status}`}>{workflow.status}</span>
              </div>
              <p className="body-copy">{workflow.goal}</p>
              <p className="muted small"><strong>Trigger</strong> — {workflow.trigger}</p>
              <div className="badge-row subdued-tags">
                {(workflow.moduleIds ?? []).length > 0 ? (workflow.moduleIds ?? []).map((id) => (
                  <span className="tag" key={id}>{moduleName(id)}</span>
                )) : <span className="tag">No modules attached</span>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
