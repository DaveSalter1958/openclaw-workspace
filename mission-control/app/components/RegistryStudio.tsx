"use client";

import { useState, useTransition } from 'react';
import type { ModuleDefinition, ToolIdea, WorkflowDefinition, ModuleType, ModuleState, ToolIdeaStatus, WorkflowStatus } from '@/lib/types';

type Props = {
  initialIdeas: ToolIdea[];
  initialModules: ModuleDefinition[];
  initialWorkflows: WorkflowDefinition[];
};

export function RegistryStudio({ initialIdeas, initialModules, initialWorkflows }: Props) {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [modules, setModules] = useState(initialModules);
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [isPending, startTransition] = useTransition();

  const [ideaForm, setIdeaForm] = useState({
    name: '', owner: 'Dave', problem: '', nextStep: '', status: 'discovery' as ToolIdeaStatus, tags: '', users: '', outputs: '',
  });
  const [moduleForm, setModuleForm] = useState({
    name: '', type: 'automation' as ModuleType, description: '', state: 'planned' as ModuleState, inputs: '', outputs: '',
  });
  const [workflowForm, setWorkflowForm] = useState({
    name: '', owner: 'Dave', goal: '', trigger: '', status: 'draft' as WorkflowStatus, steps: '',
  });

  function splitCsv(value: string) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  async function submit(kind: 'idea' | 'module' | 'workflow') {
    startTransition(async () => {
      if (kind === 'idea') {
        const response = await fetch('/api/registry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            ...ideaForm,
            tags: splitCsv(ideaForm.tags),
            users: splitCsv(ideaForm.users),
            outputs: splitCsv(ideaForm.outputs),
          }),
        });
        if (!response.ok) return;
        const { item } = await response.json();
        setIdeas((current) => [item, ...current]);
        setIdeaForm({ name: '', owner: 'Dave', problem: '', nextStep: '', status: 'discovery', tags: '', users: '', outputs: '' });
      }

      if (kind === 'module') {
        const response = await fetch('/api/registry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            ...moduleForm,
            inputs: splitCsv(moduleForm.inputs),
            outputs: splitCsv(moduleForm.outputs),
          }),
        });
        if (!response.ok) return;
        const { item } = await response.json();
        setModules((current) => [item, ...current]);
        setModuleForm({ name: '', type: 'automation', description: '', state: 'planned', inputs: '', outputs: '' });
      }

      if (kind === 'workflow') {
        const response = await fetch('/api/registry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            ...workflowForm,
            steps: splitCsv(workflowForm.steps),
          }),
        });
        if (!response.ok) return;
        const { item } = await response.json();
        setWorkflows((current) => [item, ...current]);
        setWorkflowForm({ name: '', owner: 'Dave', goal: '', trigger: '', status: 'draft', steps: '' });
      }
    });
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="grid grid-3">
        <div className="card">
          <div className="section-title"><div><h2>New tool idea</h2><p className="muted small">Capture the problem before the implementation fantasy.</p></div></div>
          <div className="form">
            <input className="input" placeholder="Name" value={ideaForm.name} onChange={(e) => setIdeaForm((c) => ({ ...c, name: e.target.value }))} />
            <input className="input" placeholder="Owner" value={ideaForm.owner} onChange={(e) => setIdeaForm((c) => ({ ...c, owner: e.target.value }))} />
            <select className="select" value={ideaForm.status} onChange={(e) => setIdeaForm((c) => ({ ...c, status: e.target.value as ToolIdeaStatus }))}>
              <option value="discovery">discovery</option><option value="building">building</option><option value="ready">ready</option>
            </select>
            <textarea className="input" rows={3} placeholder="Problem" value={ideaForm.problem} onChange={(e) => setIdeaForm((c) => ({ ...c, problem: e.target.value }))} />
            <textarea className="input" rows={2} placeholder="Next step" value={ideaForm.nextStep} onChange={(e) => setIdeaForm((c) => ({ ...c, nextStep: e.target.value }))} />
            <input className="input" placeholder="Tags comma-separated" value={ideaForm.tags} onChange={(e) => setIdeaForm((c) => ({ ...c, tags: e.target.value }))} />
            <input className="input" placeholder="Users comma-separated" value={ideaForm.users} onChange={(e) => setIdeaForm((c) => ({ ...c, users: e.target.value }))} />
            <input className="input" placeholder="Outputs comma-separated" value={ideaForm.outputs} onChange={(e) => setIdeaForm((c) => ({ ...c, outputs: e.target.value }))} />
            <button className="button" type="button" onClick={() => submit('idea')} disabled={isPending}>{isPending ? 'Saving…' : 'Create idea'}</button>
          </div>
        </div>

        <div className="card">
          <div className="section-title"><div><h2>New module</h2><p className="muted small">Define a reusable primitive.</p></div></div>
          <div className="form">
            <input className="input" placeholder="Name" value={moduleForm.name} onChange={(e) => setModuleForm((c) => ({ ...c, name: e.target.value }))} />
            <select className="select" value={moduleForm.type} onChange={(e) => setModuleForm((c) => ({ ...c, type: e.target.value as ModuleType }))}>
              <option value="ingest">ingest</option><option value="model">model</option><option value="automation">automation</option><option value="review">review</option>
            </select>
            <select className="select" value={moduleForm.state} onChange={(e) => setModuleForm((c) => ({ ...c, state: e.target.value as ModuleState }))}>
              <option value="planned">planned</option><option value="live">live</option>
            </select>
            <textarea className="input" rows={3} placeholder="Description" value={moduleForm.description} onChange={(e) => setModuleForm((c) => ({ ...c, description: e.target.value }))} />
            <input className="input" placeholder="Inputs comma-separated" value={moduleForm.inputs} onChange={(e) => setModuleForm((c) => ({ ...c, inputs: e.target.value }))} />
            <input className="input" placeholder="Outputs comma-separated" value={moduleForm.outputs} onChange={(e) => setModuleForm((c) => ({ ...c, outputs: e.target.value }))} />
            <button className="button" type="button" onClick={() => submit('module')} disabled={isPending}>{isPending ? 'Saving…' : 'Create module'}</button>
          </div>
        </div>

        <div className="card">
          <div className="section-title"><div><h2>New workflow</h2><p className="muted small">Compose modules into an operating flow.</p></div></div>
          <div className="form">
            <input className="input" placeholder="Name" value={workflowForm.name} onChange={(e) => setWorkflowForm((c) => ({ ...c, name: e.target.value }))} />
            <input className="input" placeholder="Owner" value={workflowForm.owner} onChange={(e) => setWorkflowForm((c) => ({ ...c, owner: e.target.value }))} />
            <select className="select" value={workflowForm.status} onChange={(e) => setWorkflowForm((c) => ({ ...c, status: e.target.value as WorkflowStatus }))}>
              <option value="draft">draft</option><option value="active">active</option>
            </select>
            <textarea className="input" rows={3} placeholder="Goal" value={workflowForm.goal} onChange={(e) => setWorkflowForm((c) => ({ ...c, goal: e.target.value }))} />
            <textarea className="input" rows={2} placeholder="Trigger" value={workflowForm.trigger} onChange={(e) => setWorkflowForm((c) => ({ ...c, trigger: e.target.value }))} />
            <input className="input" placeholder="Steps comma-separated" value={workflowForm.steps} onChange={(e) => setWorkflowForm((c) => ({ ...c, steps: e.target.value }))} />
            <button className="button" type="button" onClick={() => submit('workflow')} disabled={isPending}>{isPending ? 'Saving…' : 'Create workflow'}</button>
          </div>
        </div>
      </section>

      <section className="grid grid-3">
        <div className="card"><h2>Ideas</h2><p className="muted small">{ideas.length} tracked</p><div className="list compact-list">{ideas.slice(0, 5).map((idea) => <div className="item" key={idea.id}><strong>{idea.name}</strong><p className="muted small">{idea.status} · {idea.updatedAt}</p></div>)}</div></div>
        <div className="card"><h2>Modules</h2><p className="muted small">{modules.length} defined</p><div className="list compact-list">{modules.slice(0, 5).map((module) => <div className="item" key={module.id}><strong>{module.name}</strong><p className="muted small">{module.type} · {module.state}</p></div>)}</div></div>
        <div className="card"><h2>Workflows</h2><p className="muted small">{workflows.length} tracked</p><div className="list compact-list">{workflows.slice(0, 5).map((workflow) => <div className="item" key={workflow.id}><strong>{workflow.name}</strong><p className="muted small">{workflow.status} · {workflow.owner}</p></div>)}</div></div>
      </section>
    </div>
  );
}
