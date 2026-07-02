import { DocumentItem } from '@/lib/types';

export function DocumentList({ documents }: { documents: DocumentItem[] }) {
  if (documents.length === 0) {
    return <p className="muted">Nothing to show yet.</p>;
  }

  return (
    <div className="list">
      {documents.map((document) => (
        <article className="item" key={document.id}>
          <div className="item-top">
            <div>
              <h3>{document.title}</h3>
              <p className="muted small">{document.type} · Updated {document.updatedAt}</p>
            </div>
            <span className="tag">{document.status}</span>
          </div>
          <p className="muted">{document.summary}</p>
          <p className="muted small">
            {document.source}{document.path ? ` · ${document.path}` : ''}
          </p>
        </article>
      ))}
    </div>
  );
}
