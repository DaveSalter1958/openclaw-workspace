import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const workspaceDir = path.resolve(process.cwd(), '..');
const tasksPath = path.join(workspaceDir, 'second-brain', 'data', 'tasks.json');

type Task = { id: string; domain?: string; project?: string; notes?: string };
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailMessage = { id: string; labelIds?: string[]; internalDate?: string; snippet?: string; payload?: { headers?: Array<{ name: string; value: string }>; parts?: GmailPart[]; body?: { data?: string }; mimeType?: string } };

type ReplyItem = {
  id: string;
  source: 'Gmail' | 'Mission Control';
  direction: 'incoming' | 'outgoing';
  from: string;
  to?: string;
  date: string;
  subject?: string;
  body: string;
};

function lineValue(notes: string, label: string) {
  const line = notes.split(/\r?\n/).find((item) => item.startsWith(`${label}:`));
  return line ? line.slice(label.length + 1).trim() : '';
}

function parseEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return plain ? plain[0].trim() : '';
}

function accountFromNotes(notes: string) {
  const source = lineValue(notes, 'Source account');
  const sourceEmail = parseEmailAddress(source);
  if (sourceEmail) return sourceEmail.toLowerCase();
  if (/Personal/i.test(source)) return 'drs7890@gmail.com';
  if (/DRS/i.test(source)) return 'drs@drs-engineering.net';
  return '';
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function htmlToText(value: string) {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textFromPart(part?: GmailPart): string {
  if (!part) return '';
  if (part.body?.data && part.mimeType === 'text/plain') return decodeBase64Url(part.body.data).trim();
  if (part.body?.data && part.mimeType === 'text/html') return htmlToText(decodeBase64Url(part.body.data));
  const children = part.parts || [];
  const plain = children.map(textFromPart).find(Boolean);
  return plain || '';
}

function cleanEmailBody(value: string) {
  let body = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const cutoffPatterns = [
    /^On .{0,240} wrote:$/im,
    /^From:\s.+$/im,
    /^Sent:\s.+$/im,
    /^To:\s.+$/im,
    /^Subject:\s.+$/im,
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{6,}$/m,
    /^>\s?/m,
  ];
  const cutoffIndexes = cutoffPatterns
    .map((pattern) => body.search(pattern))
    .filter((index) => index > 0);
  if (cutoffIndexes.length) body = body.slice(0, Math.min(...cutoffIndexes)).trim();

  const signaturePatterns = [
    /\n\s*--\s*\n[\s\S]*$/,
    /\n\s*(?:thanks|thank you|thx|regards|best|best regards|sincerely|respectfully|cheers),?\s*\n[\s\S]{0,1600}$/i,
    /\n\s*(?:kind regards|warm regards|sent from my iphone|sent from my ipad|get outlook for ios)\b[\s\S]*$/i,
    /\n\s*[A-Z][A-Za-z .'-]{1,60}\s*\n(?:[A-Za-z .,&-]+\n){0,8}(?:\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|www\.|https?:\/\/)[\s\S]*$/i,
  ];
  for (const pattern of signaturePatterns) {
    const next = body.replace(pattern, '').trim();
    if (next.length >= 12) body = next;
  }

  return body
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function messageBody(message: GmailMessage) {
  const payload = message.payload;
  if (!payload) return message.snippet || '';
  return cleanEmailBody(textFromPart(payload as GmailPart) || message.snippet || '');
}

function replyDateValue(reply: ReplyItem) {
  const parsed = Date.parse(reply.date || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function actionHistoryReplies(notes: string): ReplyItem[] {
  const text = notes || '';
  const lines = text.split(/\r?\n/);
  const replies: ReplyItem[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^-\s+([^:]+):\s+Reply sent from\s+(.+?)\s+to\s+(.+?)\./i);
    if (!match) continue;
    const summaryLine = lines.slice(i + 1, i + 5).find((line) => line.trim().startsWith('Reply summary:')) || '';
    replies.push({
      id: `mission-${i}`,
      source: 'Mission Control',
      from: match[2],
      to: match[3],
      date: match[1],
      direction: 'outgoing',
      body: cleanEmailBody(summaryLine.replace(/^\s*Reply summary:\s*/i, '').trim()) || '(reply sent from Mission Control)',
    });
  }
  return replies;
}

async function readTask(taskId: string) {
  const raw = await fs.readFile(tasksPath, 'utf8');
  const tasks = JSON.parse(raw) as Task[];
  return tasks.find((item) => item.id === taskId) || null;
}

export async function GET(request: NextRequest) {
  const taskId = new URL(request.url).searchParams.get('taskId') || '';
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  try {
    const task = await readTask(taskId);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.domain !== 'email' && !task.project?.startsWith('Email')) return NextResponse.json({ error: 'Task is not an email task' }, { status: 400 });

    const notes = task.notes || '';
    const account = accountFromNotes(notes);
    const threadId = lineValue(notes, 'Thread ID') || lineValue(notes, 'Gmail message ID');
    if (!account) return NextResponse.json({ error: 'Could not determine receiving email account' }, { status: 400 });
    if (!threadId) return NextResponse.json({ error: 'Missing Gmail thread ID' }, { status: 400 });

    const args: string[] = [];
    if (account === 'drs7890@gmail.com') args.push('--client', 'personal');
    args.push('gmail', 'thread', 'get', threadId, '--account', account, '--json', '--full');
    const result = await execFileAsync('gog', args, { timeout: 120000, maxBuffer: 25 * 1024 * 1024 });
    const data = JSON.parse(result.stdout);
    const messages = (data?.thread?.messages || []) as GmailMessage[];
    const accountLower = account.toLowerCase();
    const gmailReplies = messages
      .map((message) => {
        const from = header(message, 'From') || account;
        const fromEmail = parseEmailAddress(from).toLowerCase();
        const labels = new Set((message.labelIds || []).map((label) => label.toUpperCase()));
        const outgoing = fromEmail === accountLower || labels.has('SENT');
        return {
          id: `gmail-${message.id}`,
          source: 'Gmail' as const,
          direction: outgoing ? 'outgoing' as const : 'incoming' as const,
          from,
          to: header(message, 'To'),
          date: header(message, 'Date') || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : ''),
          subject: header(message, 'Subject'),
          body: messageBody(message),
        };
      })
      .filter((message) => message.body.trim());

    const hasGmailOutgoing = gmailReplies.some((reply) => reply.direction === 'outgoing');
    const replies = [...gmailReplies, ...(hasGmailOutgoing ? [] : actionHistoryReplies(notes))]
      .sort((a, b) => replyDateValue(a) - replyDateValue(b));
    return NextResponse.json({ replies });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load email reply history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
