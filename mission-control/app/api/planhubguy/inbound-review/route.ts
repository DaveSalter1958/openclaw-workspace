import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { setAllQueueSnapshots } from '../queue-state';
const execFileAsync = promisify(execFile);

async function fetchQueue(label: 'Possible Work' | 'Follow up') {
  const { stdout } = await execFileAsync('/usr/bin/python3', [
    '/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-review.py',
    'list',
    '--label', label,
    '--max', '200',
  ]);
  const parsed = JSON.parse(stdout || '{}');
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export async function POST() {
  try {
    const env = {
      ...process.env,
      PLANHUBGUY_INBOUND_ONLY: '1',
      PLANHUBGUY_BACKFILL_INBOUND: '1',
      PLANHUBGUY_IGNORE_SEEN_INBOUND: '1',
    } as NodeJS.ProcessEnv;
    const { stdout, stderr } = await execFileAsync('/usr/bin/python3', ['/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py'], { env });
    const { stdout: syncStdout, stderr: syncStderr } = await execFileAsync('/usr/bin/python3', ['/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-followup-sync.py']);
    const [possibleWorkItems, followUpItems] = await Promise.all([
      fetchQueue('Possible Work'),
      fetchQueue('Follow up'),
    ]);
    await setAllQueueSnapshots({ 'Possible Work': possibleWorkItems, 'Follow up': followUpItems, 'Automatic Reply': [] });
    return NextResponse.json({ ok: true, stdout, stderr, syncStdout, syncStderr, possibleWorkCount: possibleWorkItems.length, followUpCount: followUpItems.length, automaticCount: 0, queueMode: 'snapshot' });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'inbound review failed' }, { status: 500 });
  }
}
