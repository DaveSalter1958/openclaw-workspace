import Link from 'next/link';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';
import path from 'path';
import { notFound } from 'next/navigation';
import { TaskEditor } from '@/app/components/TaskEditor';

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

async function getTask(id: string): Promise<Task | null> {
  try {
    const raw = await fs.readFile(tasksPath, 'utf8');
    const tasks = JSON.parse(raw) as Task[];
    return tasks.find((task) => task.id === id) ?? null;
  } catch {
    return null;
  }
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const task = await getTask(id);
  if (!task) notFound();

  const returnPath = from === 'agent-tasks' ? '/mission-control/agent-tasks' : '/mission-control';
  const backHref = from === 'agent-tasks' ? '/agent-tasks' : '/';
  const backLabel = from === 'agent-tasks' ? '← Back to Agent Tasks' : '← Back to Tasks';

  return (
    <main className="reference-dashboard">
      <div className="reference-toolbar">
        <Link className="button secondary" href={backHref}>{backLabel}</Link>
      </div>
      <TaskEditor initialTask={task} returnPath={returnPath} />
    </main>
  );
}
