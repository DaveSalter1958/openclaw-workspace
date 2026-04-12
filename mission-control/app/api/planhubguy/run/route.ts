import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const env = { ...process.env } as NodeJS.ProcessEnv;
    if (body?.manual === true) env.PLANHUBGUY_MANUAL = '1';
    const { stdout, stderr } = await execFileAsync('/usr/bin/python3', ['/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py'], { env });
    return NextResponse.json({ ok: true, stdout, stderr });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'run failed' }, { status: 500 });
  }
}
