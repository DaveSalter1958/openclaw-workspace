import type { QueueItem } from '@/lib/types';

export function QueueList({ items }: { items: QueueItem[] }) {
  return (
    <div className="list compact-list">
      {items.map((item) => (
        <article className="item" key={item.title}>
          <div className="item-top">
            <div>
              <p className="eyebrow">Build queue</p>
              <h3>{item.title}</h3>
            </div>
            <span className={`status-pill priority-${item.priority}`}>{item.priority}</span>
          </div>
          <p className="muted body-copy">{item.why}</p>
        </article>
      ))}
    </div>
  );
}
