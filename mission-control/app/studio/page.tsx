import { getMemoryDashboard } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function MemoryPage() {
  const memory = await getMemoryDashboard();
  const latest = memory.latest;

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card hero" style={{ minHeight: 160 }}>
        <div className="kicker">Memory</div>
        <h1>Daily working log.</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>
          This is the day-by-day record of what we discussed, what changed, and what matters later when you ask about a specific project or date.
        </p>
      </section>

      <section className="memory-dashboard-grid">
        <section className="card memory-latest-card">
          <div className="section-title">
            <div>
              <h2>Latest log</h2>
              <p className="muted small">The most recent day in the memory system.</p>
            </div>
          </div>
          {latest ? (
            <div className="memory-latest-body">
              <div className="memory-date-chip">{latest.date}</div>
              <h2>{latest.title}</h2>
              <p className="body-copy">{latest.summary}</p>
              {latest.highlights.length > 0 ? (
                <div className="memory-highlight-list">
                  {latest.highlights.map((item, index) => (
                    <div className="memory-highlight-item" key={`${latest.date}-${index}`}>{item}</div>
                  ))}
                </div>
              ) : null}
              <p className="muted small">{latest.file}</p>
            </div>
          ) : <p className="muted">No daily logs found yet.</p>}
        </section>

        <aside className="card memory-rules-card">
          <div className="section-title">
            <div>
              <h2>Operating rule</h2>
              <p className="muted small">How this system should be used.</p>
            </div>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <div>
              <p className="eyebrow">Capture</p>
              <p className="body-copy">After discussions, I should add a concise summary to the current day’s memory file.</p>
            </div>
            <div>
              <p className="eyebrow">Recall</p>
              <p className="body-copy">When you ask about a project, decision, or day, I should check these daily logs first.</p>
            </div>
            <div>
              <p className="eyebrow">Files</p>
              <p className="muted small">Stored in <code>workspace/memory/YYYY-MM-DD.md</code>.</p>
            </div>
          </div>
        </aside>
      </section>

      <section className="list memory-day-list">
        {memory.entries.map((entry) => (
          <article className="item memory-day-card" key={entry.file}>
            <div className="item-top">
              <div>
                <h3>{entry.date}</h3>
                <p className="muted small">{entry.title}</p>
              </div>
              <span className="status-pill active">{entry.lineCount} lines</span>
            </div>
            <p className="body-copy">{entry.summary}</p>
            {entry.highlights.length > 0 ? (
              <div className="memory-highlight-list compact">
                {entry.highlights.map((item, index) => (
                  <div className="memory-highlight-item" key={`${entry.date}-${index}`}>{item}</div>
                ))}
              </div>
            ) : null}
            <p className="muted small">{entry.file}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
