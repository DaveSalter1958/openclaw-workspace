import Link from 'next/link';
import { getTaskBoard } from '@/lib/data';

export const dynamic = 'force-dynamic';

function renderTaskCard(item: {
  id: string;
  title: string;
  dueLabel?: string;
  priority: 'low' | 'medium' | 'high';
  project: string;
  notes?: string;
}) {
  const accent = item.priority === 'high' ? 'amber' : item.priority === 'medium' ? 'cyan' : 'violet';
  return (
    <Link className="reference-task-card task-card-link" href={`/tasks/${item.id}?from=tasks`} key={item.id}>
      <h3><i className={`dot dot-${accent}`} />{item.title}</h3>
      <p>{item.notes || `Project: ${item.project}`}</p>
      <div className="reference-card-meta">
        <span className="reference-source-chip">{item.project}</span>
        <span>{item.dueLabel || item.priority}</span>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const { dueToday, dueThisWeek, dueLater } = await getTaskBoard();

  const total = dueToday.length + dueThisWeek.length + dueLater.length;

  return (
    <main className="reference-dashboard">
      <section className="reference-header desktop-priority-header">
        <div className="reference-header-top">
          <div className="reference-title-pill">▣ Tasks</div>
          <div className="reference-metrics">
            <div className="reference-metric"><strong>{dueToday.length}</strong><span>Due today</span></div>
            <div className="reference-metric"><strong>{dueThisWeek.length}</strong><span>Due this week</span></div>
            <div className="reference-metric"><strong>{dueLater.length}</strong><span>Due later</span></div>
            <div className="reference-metric"><strong>{total}</strong><span>Total tasks</span></div>
          </div>
        </div>

        <div className="reference-toolbar">
          <Link className="reference-primary-button" href="/guy">+ New task</Link>
          <div className="task-legend" aria-label="Task priority legend">
            <span className="task-legend-label">Circle next to task name = priority:</span>
            <span className="task-legend-item"><i className="dot dot-amber" /> Amber = high priority</span>
            <span className="task-legend-item"><i className="dot dot-cyan" /> Cyan = medium priority</span>
            <span className="task-legend-item"><i className="dot dot-violet" /> Violet = low priority</span>
          </div>
        </div>
      </section>

      <section className="reference-board desktop-priority-board task-board-3col">
        <div className="reference-column">
          <div className="reference-column-head">
            <span className="reference-column-label">Due today</span>
            <span>{dueToday.length}</span>
          </div>
          <div className="reference-card-stack">
            {dueToday.length > 0 ? dueToday.map(renderTaskCard) : <div className="reference-empty-card compact-empty">Nothing due today</div>}
          </div>
        </div>

        <div className="reference-column">
          <div className="reference-column-head">
            <span className="reference-column-label">Due this week</span>
            <span>{dueThisWeek.length}</span>
          </div>
          <div className="reference-card-stack">
            {dueThisWeek.length > 0 ? dueThisWeek.map(renderTaskCard) : <div className="reference-empty-card compact-empty">Nothing due this week</div>}
          </div>
        </div>

        <div className="reference-column">
          <div className="reference-column-head">
            <span className="reference-column-label">Due later</span>
            <span>{dueLater.length}</span>
          </div>
          <div className="reference-card-stack">
            {dueLater.length > 0 ? dueLater.map(renderTaskCard) : <div className="reference-empty-card compact-empty">Nothing due later</div>}
          </div>
        </div>
      </section>

    </main>
  );
}
