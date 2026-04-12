import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const WORKDIR = '/home/davesalter/.openclaw/workspace';
const CLAWHUB_BIN = '/home/davesalter/.npm-global/bin/clawhub';

async function runClawhub(args: string[]) {
  const { stdout, stderr } = await execFileAsync(CLAWHUB_BIN, args, {
    cwd: WORKDIR,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stderr?.trim()) console.error(stderr);
  return stdout;
}

async function getInstalledMap() {
  try {
    const stdout = await runClawhub(['list']);
    const map: Record<string, string> = {};
    stdout.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) map[parts[0]] = parts[1];
    });
    return map;
  } catch {
    return {};
  }
}

function parseSearchOutput(stdout: string) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('- Searching'))
    .map((line) => {
      const match = line.match(/^(\S+)\s+(.*?)\s+\(([0-9.]+)\)$/);
      if (!match) return null;
      return {
        slug: match[1],
        name: match[2],
        description: `Search relevance ${match[3]}`,
      };
    })
    .filter(Boolean) as any[];
}

function decorateItems(items: any[], installed: Record<string, string>) {
  return items.map((item) => {
    const slug = item.slug || item.skill?.slug;
    const installedVersion = installed[slug] || null;
    return {
      slug,
      name: item.name || item.displayName || item.skill?.displayName || slug,
      description: item.description || item.summary || item.skill?.summary || '',
      ownerHandle: item.ownerHandle || item.owner?.handle || item.skill?.ownerHandle || '',
      latestVersion: item.latestVersion?.version || item.skill?.tags?.latest || item.version || '',
      installs: item.installs || item.stats?.installsCurrent || item.skill?.stats?.installsCurrent || 0,
      downloads: item.downloads || item.stats?.downloads || item.skill?.stats?.downloads || 0,
      stars: item.stars || item.stats?.stars || item.skill?.stats?.stars || 0,
      installed: Boolean(installedVersion),
      installedVersion,
    };
  });
}

async function enrichSearchItems(items: any[]) {
  const enriched = await Promise.all(items.map(async (item) => {
    try {
      const stdout = await runClawhub(['inspect', item.slug, '--json']);
      const data = JSON.parse(stdout);
      return {
        ...item,
        ownerHandle: data.owner?.handle || '',
        latestVersion: data.latestVersion?.version || data.skill?.tags?.latest || '',
        installs: data.skill?.stats?.installsCurrent || 0,
        downloads: data.skill?.stats?.downloads || 0,
        stars: data.skill?.stats?.stars || 0,
        description: data.skill?.summary || item.description || '',
      };
    } catch {
      return item;
    }
  }));

  enriched.sort((a, b) => (b.installs || 0) - (a.installs || 0) || (b.downloads || 0) - (a.downloads || 0));
  return enriched;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'explore';

  try {
    const installed = await getInstalledMap();

    if (mode === 'search') {
      const query = searchParams.get('q')?.trim();
      const limit = searchParams.get('limit') || '20';
      if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 });
      const stdout = await runClawhub(['search', query, '--limit', limit]);
      const parsed = parseSearchOutput(stdout);
      const enriched = await enrichSearchItems(parsed);
      const items = decorateItems(enriched, installed);
      return NextResponse.json({ items, installed });
    }

    if (mode === 'inspect') {
      const slug = searchParams.get('slug')?.trim();
      if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
      const stdout = await runClawhub(['inspect', slug, '--json']);
      const data = JSON.parse(stdout);
      return NextResponse.json({
        slug: data.skill?.slug || slug,
        name: data.skill?.displayName || slug,
        description: data.skill?.summary || '',
        ownerHandle: data.owner?.handle || '',
        latestVersion: data.latestVersion?.version || data.skill?.tags?.latest || '',
        downloads: data.skill?.stats?.downloads || 0,
        installs: data.skill?.stats?.installsCurrent || 0,
        stars: data.skill?.stats?.stars || 0,
        installed: Boolean(installed[slug]),
        installedVersion: installed[slug] || null,
      });
    }

    const sort = searchParams.get('sort') || 'installs';
    const limit = searchParams.get('limit') || '24';
    const stdout = await runClawhub(['explore', '--sort', sort, '--limit', limit, '--json']);
    const data = JSON.parse(stdout);
    return NextResponse.json({ items: decorateItems(data.items || [], installed), installed });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'clawhub failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const version = typeof body.version === 'string' ? body.version.trim() : '';
    const action = typeof body.action === 'string' ? body.action : 'install';
    if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

    const args = [action === 'update' ? 'update' : 'install', slug, '--no-input'];
    if (version) args.push('--version', version);
    const stdout = await runClawhub(args);
    return NextResponse.json({ ok: true, output: stdout });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'clawhub action failed' }, { status: 500 });
  }
}
