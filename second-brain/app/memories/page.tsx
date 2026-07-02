import { MemoryList } from '@/app/components/MemoryList';
import { getMemories } from '@/lib/data';

export default async function MemoriesPage() {
  const memories = await getMemories();
  const longTerm = memories.filter((memory) => memory.kind === 'long-term');
  const daily = memories.filter((memory) => memory.kind === 'daily');

  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card hero">
        <div className="kicker">Memories</div>
        <h1>Review moments worth keeping accessible.</h1>
        <p className="muted">
          This page now reads your actual <code>MEMORY.md</code> and <code>memory/*.md</code> files from the workspace.
        </p>
      </section>
      <section className="grid grid-2">
        <div className="card">
          <h2>Long-term memory</h2>
          <p className="muted small">Curated memory that should remain stable and useful.</p>
          <MemoryList memories={longTerm} />
        </div>
        <div className="card">
          <h2>Daily memory</h2>
          <p className="muted small">Recent day files, surfaced for review rather than burial.</p>
          <MemoryList memories={daily} />
        </div>
      </section>
    </main>
  );
}
