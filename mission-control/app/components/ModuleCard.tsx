import type { ModuleDefinition } from '@/lib/types';

export function ModuleCard({ module }: { module: ModuleDefinition }) {
  return (
    <article className="item">
      <div className="item-top">
        <div>
          <p className="eyebrow">{module.type}</p>
          <h3>{module.name}</h3>
        </div>
        <span className={`status-pill ${module.state}`}>{module.state}</span>
      </div>
      <p className="body-copy">{module.description}</p>
      <div className="meta-stack muted small">
        <p><strong>Inputs</strong> — {module.inputs.join(', ')}</p>
        <p><strong>Outputs</strong> — {module.outputs.join(', ')}</p>
      </div>
    </article>
  );
}
