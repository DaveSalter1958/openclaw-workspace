import type { ToolIdea } from '@/lib/types';

export function IdeaCard({ idea }: { idea: ToolIdea }) {
  return (
    <article className="item">
      <div className="item-top">
        <div>
          <p className="eyebrow">Tool idea</p>
          <h3>{idea.name}</h3>
          <p className="muted small">{idea.owner} · Updated {idea.updatedAt}</p>
        </div>
        <span className={`status-pill ${idea.status}`}>{idea.status}</span>
      </div>
      <p className="body-copy">{idea.problem}</p>
      <p className="muted small"><strong>Next step</strong> — {idea.nextStep}</p>
      <div className="badge-row subdued-tags">
        {idea.tags.map((tag) => (
          <span className="tag" key={tag}>{tag}</span>
        ))}
      </div>
    </article>
  );
}
