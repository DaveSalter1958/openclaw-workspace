import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const workspaceDir = path.resolve(process.cwd(), '..');
const tasksPath = path.join(workspaceDir, 'second-brain', 'data', 'tasks.json');
const gogEnv = { ...process.env, GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD ?? '' };

type Task = {
  id: string;
  title: string;
  status: 'open' | 'done';
  priority: 'low' | 'medium' | 'high';
  domain?: string;
  project?: string;
  notes?: string;
};

type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

type AttachmentItem = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
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

function safeFilename(value: string) {
  return (value || 'attachment').replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').slice(0, 180) || 'attachment';
}

async function readTask(taskId: string) {
  const raw = await fs.readFile(tasksPath, 'utf8');
  const tasks = JSON.parse(raw) as Task[];
  return tasks.find((item) => item.id === taskId) || null;
}

function gogBaseArgs(account: string) {
  const args = [] as string[];
  if (account === 'drs7890@gmail.com') args.push('--client', 'personal');
  return args;
}

async function messageForTask(task: Task) {
  const notes = task.notes || '';
  const account = accountFromNotes(notes);
  const messageId = lineValue(notes, 'Gmail message ID');
  if (!account) throw new Error('Could not determine receiving email account');
  if (!messageId) throw new Error('Missing Gmail message ID');

  const args = gogBaseArgs(account);
  args.push('gmail', 'get', messageId, '--account', account, '--format', 'full', '--json');
  const result = await execFileAsync('gog', args, { timeout: 120000, maxBuffer: 20 * 1024 * 1024, env: gogEnv });
  return { account, messageId, data: JSON.parse(result.stdout) };
}

function collectAttachments(part: GmailPart | undefined, items: AttachmentItem[] = []) {
  if (!part) return items;
  const filename = (part.filename || '').trim();
  const attachmentId = part.body?.attachmentId;
  if (filename && attachmentId) {
    items.push({
      id: attachmentId,
      filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: part.body?.size || 0,
    });
  }
  for (const child of part.parts || []) collectAttachments(child, items);
  return items;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId') || '';
  const attachmentId = searchParams.get('attachmentId') || '';
  const requestedName = safeFilename(searchParams.get('filename') || 'attachment');
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  try {
    const task = await readTask(taskId);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    if (task.domain !== 'email' && !task.project?.startsWith('Email')) {
      return NextResponse.json({ error: 'Task is not an email task' }, { status: 400 });
    }

    const { account, messageId, data } = await messageForTask(task);
    const attachments = collectAttachments(data?.message?.payload);

    if (!attachmentId) return NextResponse.json({ attachments });

    const attachment = attachments.find((item) => item.id === attachmentId);
    if (!attachment) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mission-email-attachment-'));
    const filename = safeFilename(requestedName || attachment.filename);
    const outPath = path.join(tmpDir, filename);
    const args = gogBaseArgs(account);
    args.push('gmail', 'attachment', messageId, attachmentId, '--account', account, '--out', outPath, '--name', filename, '--force', '--no-input');
    await execFileAsync('gog', args, { timeout: 120000, maxBuffer: 1024 * 1024, env: gogEnv });
    const file = await fs.readFile(outPath);
    await fs.rm(tmpDir, { recursive: true, force: true });

    return new NextResponse(file, {
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'Content-Length': String(file.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load email attachments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
