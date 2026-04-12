import { ModuleCard } from '@/app/components/ModuleCard';
import { getModules } from '@/lib/data';

export default async function ModulesPage() {
  const modules = await getModules();

  return (
    <main className="grid">
      <section className="card">
        <h1>Modules</h1>
        <p className="muted">Reusable building blocks so every new tool does not start from fresh chaos.</p>
        <div className="list">
          {modules.map((module) => <ModuleCard key={module.id} module={module} />)}
        </div>
      </section>
    </main>
  );
}
