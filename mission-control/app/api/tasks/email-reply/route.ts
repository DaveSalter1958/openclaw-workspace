import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const workspaceDir = path.resolve(process.cwd(), '..');
const tasksPath = path.join(workspaceDir, 'second-brain', 'data', 'tasks.json');

type Task = {
  id: string;
  title: string;
  status: 'open' | 'done';
  priority: 'low' | 'medium' | 'high';
  domain?: string;
  dueDate?: string;
  dueTime?: string;
  project?: string;
  notes?: string;
  scope?: string;
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

function subjectWithRe(subject: string) {
  const clean = subject.trim() || '(no subject)';
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

function accountFromNotes(notes: string) {
  const source = lineValue(notes, 'Source account');
  const sourceEmail = parseEmailAddress(source);
  if (sourceEmail) return sourceEmail.toLowerCase();
  if (/Personal/i.test(source)) return 'drs7890@gmail.com';
  if (/DRS/i.test(source)) return 'drs@drs-engineering.net';
  return '';
}

async function readTasks(): Promise<Task[]> {
  const raw = await fs.readFile(tasksPath, 'utf8');
  return JSON.parse(raw) as Task[];
}

async function writeTasks(tasks: Task[]) {
  await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2) + '\n', 'utf8');
}

function summarizeText(value: string, maxLength = 320) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}…` : clean;
}

function latestEmailBody(notes: string) {
  const marker = 'Email body:';
  const index = notes.indexOf(marker);
  return index >= 0 ? notes.slice(index + marker.length).trim() : '';
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  let taskId = '';
  let replyText = '';
  let mode = 'draft';
  let attachmentFiles: File[] = [];

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    taskId = typeof formData.get('taskId') === 'string' ? String(formData.get('taskId')) : '';
    replyText = typeof formData.get('body') === 'string' ? String(formData.get('body')).trim() : '';
    mode = formData.get('mode') === 'send' ? 'send' : 'draft';
    attachmentFiles = formData.getAll('attachments').filter((item): item is File => item instanceof File && item.size > 0);
  } else {
    const body = await request.json();
    taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    replyText = typeof body?.body === 'string' ? body.body.trim() : '';
    mode = body?.mode === 'send' ? 'send' : 'draft';
  }
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  if (!replyText) return NextResponse.json({ error: 'Reply body required' }, { status: 400 });

  const tasks = await readTasks();
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const notes = task.notes || '';
  if (task.domain !== 'email' && !task.project?.startsWith('Email')) {
    return NextResponse.json({ error: 'Task is not an email task' }, { status: 400 });
  }

  const account = accountFromNotes(notes);
  const messageId = lineValue(notes, 'Gmail message ID');
  const subject = lineValue(notes, 'Subject') || task.title;
  const fromLine = lineValue(notes, 'From');
  const to = parseEmailAddress(fromLine);
  if (!account) return NextResponse.json({ error: 'Could not determine receiving email account' }, { status: 400 });
  if (!messageId) return NextResponse.json({ error: 'Missing Gmail message ID' }, { status: 400 });
  if (!to) return NextResponse.json({ error: 'Could not determine reply recipient' }, { status: 400 });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mission-email-reply-'));
  const bodyPath = path.join(tmpDir, 'reply.txt');
  await fs.writeFile(bodyPath, replyText + '\n', 'utf8');
  const attachmentPaths: string[] = [];
  for (const file of attachmentFiles) {
    const safeName = (file.name || 'attachment').replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').slice(0, 180) || 'attachment';
    const filePath = path.join(tmpDir, safeName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, bytes);
    attachmentPaths.push(filePath);
  }

  const args = [] as string[];
  if (account === 'drs7890@gmail.com') args.push('--client', 'personal');
  args.push('gmail');
  if (mode === 'draft') args.push('drafts', 'create');
  else args.push('send');
  args.push(
    '--account', account,
    '--to', to,
    '--subject', subjectWithRe(subject),
    '--body-file', bodyPath,
    '--reply-to-message-id', messageId,
  );
  for (const attachmentPath of attachmentPaths) {
    args.push('--attach', attachmentPath);
  }
  args.push('--json');

  try {
    const result = await execFileAsync('gog', args, { timeout: 120000, maxBuffer: 1024 * 1024 });
    const actionStamp = new Date().toISOString();
    const actionBlock = [
      '',
      'Action history:',
      `- ${actionStamp}: Reply ${mode === 'send' ? 'sent' : 'drafted'} from ${account} to ${to}.`,
      `  Email summary: ${summarizeText(latestEmailBody(notes) || subject)}`,
      `  Reply summary: ${summarizeText(replyText)}`,
      attachmentFiles.length ? `  Attachments: ${attachmentFiles.map((file) => file.name).join(', ')}` : '',
    ].join('\n');
    task.notes = `${notes.trim()}${actionBlock}`.trim();
    // Keep email tasks active after replies so Dave can track the conversation
    // and see the reply/response history from Mission Control.
    task.status = 'open';
    await writeTasks(tasks);
    await fs.rm(tmpDir, { recursive: true, force: true });
    let parsed: unknown = null;
    try { parsed = JSON.parse(result.stdout); } catch { parsed = result.stdout.trim(); }
    return NextResponse.json({ ok: true, mode, account, to, result: parsed });
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : 'Reply failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
