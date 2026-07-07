import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const workspaceDir = path.resolve(process.cwd(), '..');
const tasksPath = path.join(workspaceDir, 'second-brain', 'data', 'tasks.json');
const feedbackPath = path.join(workspaceDir, 'state', 'email-task-feedback.jsonl');
const gogEnv = { ...process.env, GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD ?? '' };

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

async function appendFeedback(task: Task, action: string) {
  await fs.mkdir(path.dirname(feedbackPath), { recursive: true });
  const notes = task.notes || '';
  const record = {
    recordedAt: new Date().toISOString(),
    action,
    taskId: task.id,
    title: task.title,
    sourceAccount: lineValue(notes, 'Source account'),
    from: lineValue(notes, 'From'),
    subject: lineValue(notes, 'Subject') || task.title,
    gmailMessageId: lineValue(notes, 'Gmail message ID'),
    threadId: lineValue(notes, 'Thread ID'),
  };
  await fs.appendFile(feedbackPath, JSON.stringify(record) + '\n', 'utf8');
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
  const action = body?.action === 'trash-email' ? 'trash-email' : body?.action === 'ignore-task' ? 'ignore-task' : '';

  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  if (!action) return NextResponse.json({ error: 'Valid action required' }, { status: 400 });

  const tasks = await readTasks();
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const notes = task.notes || '';
  if (task.domain !== 'email' && !task.project?.startsWith('Email')) {
    return NextResponse.json({ error: 'Task is not an email task' }, { status: 400 });
  }

  if (action === 'trash-email') {
    const account = accountFromNotes(notes);
    const messageId = lineValue(notes, 'Gmail message ID');
    if (!account) return NextResponse.json({ error: 'Could not determine receiving email account' }, { status: 400 });
    if (!messageId) return NextResponse.json({ error: 'Missing Gmail message ID' }, { status: 400 });

    const args = [] as string[];
    if (account === 'drs7890@gmail.com') args.push('--client', 'personal');
    args.push('gmail', 'trash', messageId, '--account', account, '--force', '--no-input', '--json');

    try {
      await execFileAsync('gog', args, { timeout: 120000, maxBuffer: 1024 * 1024, env: gogEnv });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not trash email in Gmail';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  await appendFeedback(task, action);
  const next = tasks.filter((item) => item.id !== taskId);
  await writeTasks(next);
  return NextResponse.json({ ok: true, action });
}
