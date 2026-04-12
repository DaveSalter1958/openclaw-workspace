import { promises as fs } from 'fs';
import path from 'path';
import { RemotionConsole } from '@/app/components/RemotionConsole';

const remotionDir = '/home/davesalter/.openclaw/workspace/remotion';
const remotionOutDir = '/home/davesalter/.openclaw/workspace/remotion/out';

type VideoItem = {
  name: string;
  size: number;
  updatedAt: string;
  url: string;
  title: string;
  category: string;
};

function humanizeTitle(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function categorize(name: string) {
  const lowered = name.toLowerCase();
  if (lowered.includes('mission')) return 'Mission intro';
  if (lowered.includes('trail')) return 'Trail briefing';
  if (lowered.includes('slideshow')) return 'Slideshow';
  if (lowered.includes('title')) return 'Title card';
  return 'General render';
}

async function getVideos(): Promise<VideoItem[]> {
  try {
    const entries = await fs.readdir(remotionOutDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /\.(mp4|webm)$/i.test(entry.name))
        .map(async (entry) => {
          const full = path.join(remotionOutDir, entry.name);
          const stat = await fs.stat(full);
          return {
            name: entry.name,
            size: stat.size,
            updatedAt: stat.mtime.toISOString(),
            url: `/api/remotion/${encodeURIComponent(entry.name)}`,
            title: humanizeTitle(entry.name),
            category: categorize(entry.name),
          };
        }),
    );

    return files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export default async function RemotionPage() {
  const videos = await getVideos();

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card remotion-hero">
        <div className="kicker">Video delivery</div>
        <h1>Mission video console</h1>
        <p className="muted" style={{ maxWidth: 760, lineHeight: 1.7 }}>
          This is now the main delivery surface for rendered videos. Preview the latest render,
          inspect the library, and manage outputs directly from Mission Control.
        </p>
        <div className="badge-row">
          <span className="badge">{videos.length} renders</span>
          <span className="badge">NASA-style review surface</span>
          <span className="badge">Local-first</span>
        </div>
      </section>

      <section className="grid grid-2-1">
        <div className="card mission-stat-card">
          <p className="eyebrow">Render location</p>
          <h2>Output bay</h2>
          <p className="muted small">{remotionOutDir}</p>
        </div>
        <div className="card mission-stat-card">
          <p className="eyebrow">Project location</p>
          <h2>Remotion project</h2>
          <p className="muted small">{remotionDir}</p>
        </div>
      </section>

      <RemotionConsole initialVideos={videos} />
    </main>
  );
}
