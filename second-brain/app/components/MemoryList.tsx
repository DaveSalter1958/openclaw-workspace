import { MemoryItem } from '@/lib/types';

export function MemoryList({ memories }: { memories: MemoryItem[] }) {
  if (memories.length === 0) {
    return <p className="muted">Nothing to show yet.</p>;
  }

  return (
    <div className="list">
      {memories.map((memory) => (
        <article className="item" key={memory.id}>
          <div className="item-top">
            <div>
              <h3>{memory.title}</h3>
              <p className="muted small">{memory.date} · {memory.energy} · {memory.source}</p>
            </div>
            <div className="badge-row">
              {memory.tags.map((tag) => (
                <span className="tag" key={tag}>{tag}</span>
              ))}
            </div>
          </div>
          <p className="muted">{memory.summary}</p>
        </article>
      ))}
    </div>
  );
}
