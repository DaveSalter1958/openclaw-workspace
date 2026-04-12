import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';

const stateFile = '/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json';

async function readState() {
  try {
    return JSON.parse(await fs.readFile(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

export async function GET() {
  const state = await readState();
  return NextResponse.json({ confidenceLevels: state.confidenceLevels ?? ['High', 'Medium', 'Low'] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const state = await readState();
  state.confidenceLevels = Array.isArray(body.confidenceLevels) ? body.confidenceLevels : ['High', 'Medium', 'Low'];
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return NextResponse.json({ ok: true, confidenceLevels: state.confidenceLevels });
}
