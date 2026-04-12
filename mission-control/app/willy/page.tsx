import Link from 'next/link';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

async function getMyLifeYears() {
  const dir = path.join('/home/davesalter/.openclaw/workspace/memory', 'mylife');
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((file) => /^\d{4}\.md$/.test(file))
      .map((file) => file.replace('.md', ''))
      .sort();
  } catch {
    return [] as string[];
  }
}

async function getYearNotes(year?: string) {
  if (!year) return [] as string[];
  const file = path.join('/home/davesalter/.openclaw/workspace/memory', 'mylife', `${year}.md`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [] as string[];
  }
}

export default async function MyLifePage({ searchParams }: { searchParams?: Promise<{ year?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const selectedYear = params?.year;
  const years = await getMyLifeYears();
  const notes = await getYearNotes(selectedYear);

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card hero" style={{ minHeight: 150 }}>
        <div className="kicker">MyLife</div>
        <h1>Indexed life archive.</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>
          Tap a year to open it and read the notes currently stored for that part of your life.
        </p>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Years</h2>
            <p className="muted small">Only years with records are shown.</p>
          </div>
        </div>
        <div className="year-button-grid">
          {years.length > 0 ? years.map((year) => (
            <Link key={year} href={`/willy?year=${year}`} className={`year-button ${selectedYear === year ? 'active' : ''}`}>
              {year}
            </Link>
          )) : <p className="muted">No memoir years captured yet.</p>}
        </div>
      </section>

      {selectedYear ? (
        <section className="card">
          <div className="section-title">
            <div>
              <h2>{selectedYear}</h2>
              <p className="muted small">Notes stored for this year.</p>
            </div>
          </div>
          <div className="memory-day-list">
            {notes.length > 0 ? notes.map((note, index) => (
              <article className="item memory-day-card" key={`${selectedYear}-${index}`}>
                <p className="body-copy">{note.replace(/^-\s*/, '')}</p>
              </article>
            )) : <p className="muted">No notes stored for this year yet.</p>}
          </div>
        </section>
      ) : null}
    </main>
  );
}
