import { SearchPanel } from '@/app/components/SearchPanel';
import { getDocuments, getMemories, getTasks } from '@/lib/data';

export default async function SearchPage() {
  const [memories, documents, tasks] = await Promise.all([
    getMemories(),
    getDocuments(),
    getTasks(),
  ]);

  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card hero">
        <div className="kicker">Search</div>
        <h1>Find things without rummaging like a raccoon in a filing cabinet.</h1>
        <p className="muted">
          Search across memories, workspace notes, Dropbox-indexed documents, and tasks from one page.
        </p>
      </section>
      <SearchPanel memories={memories} documents={documents} tasks={tasks} />
    </main>
  );
}
