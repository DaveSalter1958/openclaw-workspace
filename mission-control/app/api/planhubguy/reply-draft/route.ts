import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
const SCRIPT_TIMEOUT_MS = 90_000;
const SCRIPT_MAX_BUFFER = 1024 * 1024 * 8;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stdout } = await execFileAsync('/usr/bin/python3', [
      '/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-review.py',
      'draft',
      '--thread-id', String(body.threadId || ''),
      '--message-id', String(body.messageId || ''),
    ], { timeout: SCRIPT_TIMEOUT_MS, maxBuffer: SCRIPT_MAX_BUFFER });
    return NextResponse.json({ ok: true, ...JSON.parse(stdout || '{}') });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'reply draft failed' }, { status: 500 });
  }
}
