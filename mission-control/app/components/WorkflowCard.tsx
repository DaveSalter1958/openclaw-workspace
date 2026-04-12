import type { ModuleDefinition, WorkflowDefinition } from '@/lib/types';

export function WorkflowCard({ workflow, modules = [] }: { workflow: WorkflowDefinition; modules?: ModuleDefinition[] }) {
  const moduleNames = (workflow.moduleIds ?? []).map((id) => modules.find((module) => module.id === id)?.name ?? id);

  return (
    <article className="item">
      <div className="item-top">
        <div>
          <p className="eyebrow">Workflow</p>
          <h3>{workflow.name}</h3>
          <p className="muted small">{workflow.owner}</p>
        </div>
        <span className={`status-pill ${workflow.status}`}>{workflow.status}</span>
      </div>
      <p className="body-copy">{workflow.goal}</p>
      <p className="muted small"><strong>Trigger</strong> — {workflow.trigger}</p>
      <ol className="step-list muted small">
        {workflow.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="badge-row subdued-tags">
        {moduleNames.length > 0 ? moduleNames.map((name) => (
          <span className="tag" key={name}>{name}</span>
        )) : <span className="tag">No modules attached</span>}
      </div>
    </article>
  );
}
