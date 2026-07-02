import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

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

async function readTasks(): Promise<Task[]> {
  try {
    const raw = await fs.readFile(tasksPath, 'utf8');
    return JSON.parse(raw) as Task[];
  } catch {
    return [];
  }
}

async function writeTasks(tasks: Task[]) {
  await fs.mkdir(path.dirname(tasksPath), { recursive: true });
  await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2) + '\n', 'utf8');
}

function makeTaskId() {
  return `t${Date.now()}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const task: Task = {
    id: makeTaskId(),
    title,
    status: body.status === 'done' ? 'done' : 'open',
    priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium',
    domain: typeof body.domain === 'string' ? body.domain : '',
    dueDate: typeof body.dueDate === 'string' ? body.dueDate : '',
    dueTime: typeof body.dueTime === 'string' ? body.dueTime : '17:00',
    project: typeof body.project === 'string' ? body.project : '',
    notes: typeof body.notes === 'string' ? body.notes : '',
    scope: typeof body.scope === 'string' ? body.scope : '',
  };

  const tasks = await readTasks();
  tasks.unshift(task);
  await writeTasks(tasks);
  return NextResponse.json({ task });
}
