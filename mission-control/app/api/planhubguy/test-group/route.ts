import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
const stateFile = '/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json';

async function readState() {
  try { return JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch { return {}; }
}

export async function GET() {
  const state = await readState();
  return NextResponse.json({ testGroupEmails: state.testGroupEmails ?? [], testGroupDetails: state.testGroupDetails ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const count = Number(body.count || 9);
  const env = { ...process.env, PLANHUBGUY_GENERATE_TEST_GROUP: String(count) } as NodeJS.ProcessEnv;
  if (body.balanced) env.PLANHUBGUY_BALANCED_TEST_GROUP = '1';
  const { stdout } = await execFileAsync('/usr/bin/python3', ['/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py'], { env });
  const state = await readState();
  return NextResponse.json({ ok: true, testGroupEmails: state.testGroupEmails ?? [], testGroupDetails: state.testGroupDetails ?? [], stdout });
}
