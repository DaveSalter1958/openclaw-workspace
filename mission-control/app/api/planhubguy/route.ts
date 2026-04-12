import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const stateFile = '/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json';

async function readState() {
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      mode: parsed.mode === 'live' ? 'live' : 'test',
      updatedAt: parsed.updatedAt ?? null,
      seenInboundThreads: Array.isArray(parsed.seenInboundThreads) ? parsed.seenInboundThreads : [],
      confidenceLevels: Array.isArray(parsed.confidenceLevels) ? parsed.confidenceLevels : ['High', 'Medium', 'Low'],
    };
  } catch {
    return { enabled: false, mode: 'test', updatedAt: null, seenInboundThreads: [], confidenceLevels: ['High', 'Medium', 'Low'] };
  }
}

export async function GET() {
  const state = await readState();
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  const current = await readState();
  const body = await request.json();
  const state = {
    ...current,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
    mode: body.mode === 'live' ? 'live' : body.mode === 'test' ? 'test' : current.mode,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return NextResponse.json(state);
}
