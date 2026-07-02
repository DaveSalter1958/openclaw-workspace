import Link from 'next/link';
import { EmailTaskColumn } from '@/app/components/EmailTaskColumn';
import { TaskColumn } from '@/app/components/TaskColumn';
import { getTaskBoard } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { dueToday, dueThisWeek, dueLater, emailTasks } = await getTaskBoard();

  const total = dueToday.length + dueThisWeek.length + dueLater.length + emailTasks.length;

  return (
    <main className="reference-dashboard">
      <section className="reference-header desktop-priority-header">
        <div className="reference-header-top">
          <div className="reference-title-pill">▣ Tasks</div>
          <div className="reference-metrics">
            <div className="reference-metric"><strong>{dueToday.length}</strong><span>Due today</span></div>
            <div className="reference-metric"><strong>{dueThisWeek.length}</strong><span>Due this week</span></div>
            <div className="reference-metric"><strong>{dueLater.length}</strong><span>Due later</span></div>
            <div className="reference-metric"><strong>{emailTasks.length}</strong><span>From email</span></div>
            <div className="reference-metric"><strong>{total}</strong><span>Total tasks</span></div>
          </div>
        </div>

        <div className="reference-toolbar">
          <Link className="reference-primary-button" href="/tasks/new">+ New task</Link>
        </div>
      </section>

      <section className="reference-board desktop-priority-board task-board-4col">
        <TaskColumn title="Due today" emptyLabel="Nothing due today" items={dueToday} />

        <TaskColumn title="Due this week" emptyLabel="Nothing due this week" items={dueThisWeek} />

        <TaskColumn title="Due later" emptyLabel="Nothing due later" items={dueLater} />

        <EmailTaskColumn items={emailTasks} />
      </section>

    </main>
  );
}
