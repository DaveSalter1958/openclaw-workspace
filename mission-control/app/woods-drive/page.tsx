import { WoodsDriveChecklist } from '@/app/components/WoodsDriveChecklist';
import { getWoodsDriveProject } from '@/lib/woods-drive';

export const dynamic = 'force-dynamic';

export default async function WoodsDrivePage() {
  const project = await getWoodsDriveProject();

  return (
    <main className="reference-dashboard woods-drive-page">
      <section className="reference-header">
        <div className="reference-header-top">
          <div>
            <div className="reference-title-pill">Woods Drive</div>
            <h1 className="woods-page-title">{project.name}</h1>
          </div>
          <div className="reference-metrics">
            <div className="reference-metric"><strong>{project.actions.filter((action) => !action.done).length}</strong><span>Open actions</span></div>
            <div className="reference-metric"><strong>{project.actions.length}</strong><span>Total actions</span></div>
          </div>
        </div>
      </section>

      <WoodsDriveChecklist initialActions={project.actions} />
    </main>
  );
}
