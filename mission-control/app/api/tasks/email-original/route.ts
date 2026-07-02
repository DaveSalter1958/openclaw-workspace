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

type GmailPayload = GmailPart & { headers?: Array<{ name: string; value: string }> };

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

async function readTask(taskId: string) {
  const raw = await fs.readFile(tasksPath, 'utf8');
  const tasks = JSON.parse(raw) as Task[];
  return tasks.find((item) => item.id === taskId) || null;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function actionCuePattern() {
  return /\b(?:please|can you|could you|would you|will you|need(?:ed)?|needs|let me know|confirm|approve|review|respond|reply|send|provide|advise|schedule|available|availability|question|questions|request|requested|looking for|waiting for|follow up|follow-up|do you|are you able|would like|we ask|i ask)\b|\?/i;
}

function highlightReplySignals(value: string) {
  const cue = actionCuePattern();
  return value
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (!line.trim() || !cue.test(line)) return escaped;
      return `<mark class="reply-signal">${escaped}</mark>`;
    })
    .join('\n');
}

function htmlToText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
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

function readabilityStyle() {
  return `<style>
    html, body { background: #ffffff !important; color: #111827 !important; }
    body { margin: 0; padding: 12px; font-family: Arial, sans-serif; line-height: 1.45; }
    p, div, span, td, th, li, a, font { color: #111827; }
    table { max-width: 100%; }
    img { max-width: 100%; height: auto; }
    .reply-signal { color: #b91c1c !important; background: #fee2e2 !important; border-radius: 4px; padding: 1px 3px; font-weight: 700; }
  </style>`;
}

function sanitizeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?<\/embed>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
}

function findPart(part: GmailPart | undefined, mimeType: string): string {
  if (!part) return '';
  if (part.mimeType === mimeType && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts || []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return '';
}

function fallbackStoredBody(notes: string) {
  const marker = 'Email body:';
  const index = notes.indexOf(marker);
  return index >= 0 ? notes.slice(index + marker.length).trim() : '';
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
    const messageId = lineValue(notes, 'Gmail message ID');
    if (!account) return NextResponse.json({ error: 'Could not determine receiving email account' }, { status: 400 });
    if (!messageId) return NextResponse.json({ error: 'Missing Gmail message ID' }, { status: 400 });

    const args: string[] = [];
    if (account === 'drs7890@gmail.com') args.push('--client', 'personal');
    args.push('gmail', 'get', messageId, '--account', account, '--format', 'full', '--json');
    const result = await execFileAsync('gog', args, { timeout: 120000, maxBuffer: 25 * 1024 * 1024 });
    const data = JSON.parse(result.stdout);
    const payload = data?.message?.payload as GmailPayload | undefined;
    const html = findPart(payload, 'text/html') || (typeof data?.body === 'string' && /<\w+/i.test(data.body) ? data.body : '');
    const rawText = findPart(payload, 'text/plain') || (html ? htmlToText(html) : '') || (typeof data?.body === 'string' ? data.body : '') || fallbackStoredBody(notes);
    const cleanedText = cleanEmailBody(rawText);
    const displayText = cleanedText || rawText;
    const highlightedHtml = highlightReplySignals(displayText);
    const bodyHtml = `<!doctype html><html><head>${readabilityStyle()}</head><body><pre style="white-space:pre-wrap;font-family:Arial,sans-serif;line-height:1.45;margin:0;">${highlightedHtml}</pre></body></html>`;

    return NextResponse.json({ html: bodyHtml, mode: 'clean-text', hasReplySignals: highlightedHtml.includes('reply-signal') });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load original email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
