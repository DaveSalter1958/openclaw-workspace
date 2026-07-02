import { NextRequest, NextResponse } from 'next/server';
import { readState, stateFile } from './queue-state';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  const state = await readState();
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  const current = await readState();
  const body = await request.json();
  let liveBatchLimit = current.liveBatchLimit;
  if (body.liveBatchLimit !== undefined) {
    const parsed = Number(body.liveBatchLimit);
    liveBatchLimit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : current.liveBatchLimit;
  }
  const state = {
    ...current,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : Boolean(current.enabled),
    mode: body.mode === 'live' ? 'live' : body.mode === 'test' ? 'test' : (current.mode === 'live' ? 'live' : 'test'),
    liveBatchLimit,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return NextResponse.json(state);
}
