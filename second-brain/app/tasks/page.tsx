import { TaskPanel } from '@/app/components/TaskPanel';
import { getTasks } from '@/lib/data';

export default async function TasksPage() {
  const tasks = await getTasks();

  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card hero">
        <div className="kicker">Tasks</div>
        <h1>Capture and review the next useful actions.</h1>
        <p className="muted">This is intentionally simple: add tasks fast, toggle them, and keep the queue local.</p>
      </section>
      <TaskPanel initialTasks={tasks} />
    </main>
  );
}
