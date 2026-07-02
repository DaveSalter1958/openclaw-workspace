import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { removeMessagesFromSnapshots } from '../queue-state';
const execFileAsync = promisify(execFile);
const LOG_FILE = '/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-reply-send.log';
const REPLY_EDIT_LEARNING_FILE = '/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy/reply-edit-learning.jsonl';
const SCRIPT_TIMEOUT_MS = 120_000;
const SCRIPT_MAX_BUFFER = 1024 * 1024 * 8;

async function appendLog(entry: Record<string, unknown>) {
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.appendFile(LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
}

function normalizeReply(value: string) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

async function appendReplyEditLearning(payload: any) {
  const suggestedBody = String(payload.suggestedBody || '').trim();
  const finalBody = String(payload.body || '').trim();
  if (!suggestedBody || !finalBody || normalizeReply(suggestedBody) === normalizeReply(finalBody)) return;
  await fs.mkdir(path.dirname(REPLY_EDIT_LEARNING_FILE), { recursive: true });
  await fs.appendFile(REPLY_EDIT_LEARNING_FILE, `${JSON.stringify({
    at: new Date().toISOString(),
    threadId: String(payload.threadId || ''),
    messageId: String(payload.messageId || ''),
    suggestedBody,
    finalBody,
    forceSoq: payload.forceSoq === true,
  })}\n`, 'utf8');
}

export async function POST(request: NextRequest) {
  let tempFile = '';
  let payload: any = null;
  try {
    payload = await request.json();
    await appendLog({ phase: 'start', threadId: String(payload.threadId || ''), messageId: String(payload.messageId || ''), bodyLength: String(payload.body || '').length });
    await appendReplyEditLearning(payload).catch((error) => appendLog({ phase: 'edit-learning-error', error: error?.message || 'unknown error' }));
    tempFile = path.join(os.tmpdir(), `planhubguy-reply-${Date.now()}.txt`);
    await fs.writeFile(tempFile, String(payload.body || ''), 'utf8');
    const cc = String(payload.cc || process.env.PLANHUBGUY_CC || '').trim();
    const args = [
      '/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-review.py',
      'send',
      '--thread-id', String(payload.threadId || ''),
      '--message-id', String(payload.messageId || ''),
      '--body-file', tempFile,
    ];
    if (cc) {
      args.push('--cc', cc);
    }
    if (payload.forceSoq === true) {
      args.push('--force-soq');
    }
    const { stdout, stderr } = await execFileAsync('/usr/bin/python3', args, { timeout: SCRIPT_TIMEOUT_MS, maxBuffer: SCRIPT_MAX_BUFFER });
    const parsed = JSON.parse(stdout || '{}');
    const respondedMessageIds = Array.isArray(parsed.respondedMessageIds) ? parsed.respondedMessageIds : [];
    const respondedThreadIds = [payload.threadId, parsed.threadId].map((value) => String(value || '')).filter(Boolean);
    await removeMessagesFromSnapshots(respondedMessageIds.length ? respondedMessageIds : [String(payload.messageId || '')], respondedThreadIds);
    await appendLog({ phase: 'success', threadId: String(payload.threadId || ''), messageId: String(payload.messageId || ''), stderr: stderr || '', stdoutLength: (stdout || '').length });
    return NextResponse.json({ ok: true, stderr, ...parsed });
  } catch (error: any) {
    await appendLog({ phase: 'error', threadId: String(payload?.threadId || ''), messageId: String(payload?.messageId || ''), error: error?.message || 'reply send failed', stderr: error?.stderr || '', stdout: error?.stdout || '' }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: error?.message || 'reply send failed' }, { status: 500 });
  } finally {
    if (tempFile) {
      await fs.unlink(tempFile).catch(() => undefined);
    }
  }
}
