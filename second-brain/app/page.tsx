import Link from 'next/link';
import { StatCard } from '@/app/components/StatCard';
import { getDashboardData } from '@/lib/data';

export default async function DashboardPage() {
  const { stats, spotlight, nextTask, staleDocument, memories, tasks } = await getDashboardData();

  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card hero">
        <div className="kicker">Local-first review system</div>
        <h1>Keep memories, documents, and tasks in one practical place.</h1>
        <p className="muted">
          This version is now wired into your real workspace memory files and Dropbox index, so it is finally
          acting like a second brain instead of a polite demo with cardboard scenery.
        </p>
        <div className="badge-row">
          <span className="badge">{memories.length} memory entries</span>
          <span className="badge">{tasks.filter((task) => task.status === 'open').length} open tasks</span>
          <span className="badge">{stats.dropboxDocuments} Dropbox items surfaced</span>
        </div>
      </section>

      <section className="grid grid-4">
        <StatCard label="Memories" value={stats.memories} hint="Curated and daily memory files from the workspace" />
        <StatCard label="Documents" value={stats.documents} hint="Workspace notes plus Dropbox references" />
        <StatCard label="Open tasks" value={stats.openTasks} hint="The current queue" />
        <StatCard label="Completed" value={stats.completedTasks} hint="Things that are actually done, for once" />
      </section>

      <section className="grid grid-2-1">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Memory spotlight</h2>
              <p className="muted small">A surfaced memory from your real memory files.</p>
            </div>
            <Link className="button secondary" href="/memories">View all</Link>
          </div>
          {spotlight ? (
            <article className="item">
              <h3>{spotlight.title}</h3>
              <p className="muted small">{spotlight.date} · {spotlight.kind} · {spotlight.source}</p>
              <p className="muted">{spotlight.summary}</p>
              <div className="badge-row">
                {spotlight.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
            </article>
          ) : (
            <p className="muted">No memories yet.</p>
          )}
        </div>

        <div className="grid" style={{ gap: 18 }}>
          <div className="card">
            <h2>Next task</h2>
            {nextTask ? (
              <>
                <h3>{nextTask.title}</h3>
                <p className="muted small">{nextTask.domain} · Due {nextTask.dueDate}</p>
              </>
            ) : (
              <p className="muted">No open tasks.</p>
            )}
          </div>
          <div className="card">
            <h2>Document needing attention</h2>
            {staleDocument ? (
              <>
                <h3>{staleDocument.title}</h3>
                <p className="muted small">{staleDocument.type} · {staleDocument.updatedAt}</p>
                <p className="muted">{staleDocument.summary}</p>
                <p className="muted small">{staleDocument.source}{staleDocument.path ? ` · ${staleDocument.path}` : ''}</p>
              </>
            ) : (
              <p className="muted">Nothing obviously stale.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
