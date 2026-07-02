import { DocumentList } from '@/app/components/DocumentList';
import { getDocuments } from '@/lib/data';

export default async function DocumentsPage() {
  const documents = await getDocuments();
  const workspaceDocuments = documents.filter((document) => document.location === 'workspace');
  const dropboxDocuments = documents.filter((document) => document.location === 'dropbox');

  return (
    <main className="grid" style={{ gap: 18 }}>
      <section className="card hero">
        <div className="kicker">Documents</div>
        <h1>Keep the useful references visible and reviewable.</h1>
        <p className="muted">
          This view now combines workspace notes with a live Dropbox index from <code>Private - Personal</code>.
        </p>
      </section>
      <section className="grid grid-2">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Workspace documents</h2>
              <p className="muted small">Core operating notes from the OpenClaw workspace.</p>
            </div>
          </div>
          <DocumentList documents={workspaceDocuments} />
        </div>
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Dropbox index</h2>
              <p className="muted small">Folders and top-level files from Dropbox → Private - Personal.</p>
            </div>
          </div>
          <DocumentList documents={dropboxDocuments} />
        </div>
      </section>
    </main>
  );
}
