import Link from 'next/link';
import { NewTaskForm } from '@/app/components/NewTaskForm';

export const dynamic = 'force-dynamic';

export default function NewTaskPage() {
  return (
    <main className="reference-dashboard">
      <div className="reference-toolbar">
        <Link className="button secondary" href="/">← Back to Tasks</Link>
      </div>
      <NewTaskForm />
    </main>
  );
}
