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
  const raw = await fs.readFile(tasksPath, 'utf8');
  return JSON.parse(raw) as Task[];
}

async function writeTasks(tasks: Task[]) {
  await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2) + '\n', 'utf8');
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tasks = await readTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const tasks = await readTasks();
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const current = tasks[index];
  const updated: Task = {
    ...current,
    title: typeof body.title === 'string' ? body.title.trim() || current.title : current.title,
    status: body.status === 'done' ? 'done' : body.status === 'open' ? 'open' : current.status,
    priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : current.priority,
    domain: typeof body.domain === 'string' ? body.domain : current.domain,
    dueDate: typeof body.dueDate === 'string' ? body.dueDate : current.dueDate,
    dueTime: typeof body.dueTime === 'string' ? body.dueTime : current.dueTime,
    project: typeof body.project === 'string' ? body.project : current.project,
    notes: typeof body.notes === 'string' ? body.notes : current.notes,
    scope: typeof body.scope === 'string' ? body.scope : current.scope,
  };

  tasks[index] = updated;
  await writeTasks(tasks);
  return NextResponse.json({ task: updated });
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tasks = await readTasks();
  const next = tasks.filter((item) => item.id !== id);
  if (next.length === tasks.length) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  await writeTasks(next);
  return NextResponse.json({ ok: true });
}
