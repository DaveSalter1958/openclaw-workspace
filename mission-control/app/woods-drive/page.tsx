import { WoodsDriveChecklist } from '@/app/components/WoodsDriveChecklist';
import { getWoodsDriveEmails, getWoodsDriveProject } from '@/lib/woods-drive';

export const dynamic = 'force-dynamic';

export default async function WoodsDrivePage() {
  const project = await getWoodsDriveProject();
  const emails = await getWoodsDriveEmails();

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
            <div className="reference-metric"><strong>{project.documents.length}</strong><span>Documents</span></div>
            <div className="reference-metric"><strong>{project.schedule.length}</strong><span>Schedule items</span></div>
            <div className="reference-metric"><strong>{emails.length}</strong><span>Tracked emails</span></div>
          </div>
        </div>
      </section>

      <WoodsDriveChecklist initialActions={project.actions} initialDocuments={project.documents} initialSchedule={project.schedule} initialEmails={emails} />
    </main>
  );
}
