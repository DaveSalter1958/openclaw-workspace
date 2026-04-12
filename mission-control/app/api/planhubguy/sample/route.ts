import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const env = { ...process.env, PLANHUBGUY_SAMPLE_EMAIL: String(body.email || ''), PLANHUBGUY_SAMPLE_TEMPLATE: String(body.template || 'template1') } as NodeJS.ProcessEnv;
    const { stdout, stderr } = await execFileAsync('/usr/bin/python3', ['/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py'], { env });
    return NextResponse.json({ ok: true, stdout, stderr });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'sample run failed' }, { status: 500 });
  }
}
