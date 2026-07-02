import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId') || '';
    const { threadId } = await context.params;
    const { stdout } = await execFileAsync('/usr/bin/python3', [
      '/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-review.py',
      'thread',
      '--thread-id', threadId,
      '--message-id', messageId,
    ]);
    return NextResponse.json(JSON.parse(stdout || '{}'), { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'thread view failed' }, { status: 500 });
  }
}
