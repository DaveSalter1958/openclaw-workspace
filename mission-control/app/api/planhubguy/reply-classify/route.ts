import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { removeMessagesFromSnapshots, setAllQueueSnapshots } from '../queue-state';
const execFileAsync = promisify(execFile);
const SCRIPT_PATH = '/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-review.py';
const SCRIPT_TIMEOUT_MS = 90_000;

async function fetchQueue(label: 'Possible Work' | 'Follow up') {
  const { stdout } = await execFileAsync('/usr/bin/python3', [
    SCRIPT_PATH,
    'list',
    '--label', label,
    '--max', '50',
  ], { timeout: SCRIPT_TIMEOUT_MS });
  const parsed = JSON.parse(stdout || '{}');
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let stdout = '';
    if (String(body.label || '') === 'Responded' && body.threadId) {
      const result = await execFileAsync('/usr/bin/python3', [
        SCRIPT_PATH,
        'close',
        '--thread-id', String(body.threadId || ''),
        '--message-id', String(body.messageId || ''),
      ], { timeout: SCRIPT_TIMEOUT_MS });
      stdout = result.stdout;
      const parsed = JSON.parse(stdout || '{}');
      await removeMessagesFromSnapshots(
        Array.isArray(parsed.respondedMessageIds) ? parsed.respondedMessageIds : [String(body.messageId || '')],
        [String(body.threadId || '')].filter(Boolean),
      );
      return NextResponse.json({ ok: true, ...parsed });
    } else {
      const result = await execFileAsync('/usr/bin/python3', [
        SCRIPT_PATH,
        'classify',
        '--message-id', String(body.messageId || ''),
        '--label', String(body.label || ''),
      ], { timeout: SCRIPT_TIMEOUT_MS });
      stdout = result.stdout;
    }
    const [possibleWorkItems, followUpItems] = await Promise.all([
      fetchQueue('Possible Work'),
      fetchQueue('Follow up'),
    ]);
    await setAllQueueSnapshots({ 'Possible Work': possibleWorkItems, 'Follow up': followUpItems, 'Automatic Reply': [] });
    return NextResponse.json({ ok: true, ...JSON.parse(stdout || '{}') });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'reply classify failed' }, { status: 500 });
  }
}
