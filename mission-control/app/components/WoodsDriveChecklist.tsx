"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { WoodsDriveAction, WoodsDriveDocument } from '@/lib/woods-drive';

const statusOptions = ['All', 'Open', 'In progress', 'Waiting', 'Done'];
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const defaultDropboxPath = 'DRSEng/1 - DRS Eng - Projects/2025/2025-202 1643 Woods Drive - SRS';

type DropboxEntry = {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  mimeType: string;
  modifiedAt: string;
};

function dateInputValue(value: string) {
  return isoDatePattern.test(value) ? value : '';
}

function newAction(): WoodsDriveAction {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `woods-action-${Date.now()}`;
  return {
    id,
    sourceId: '',
    phase: '',
    text: '',
    dueDate: '',
    responsible: '',
    priority: 'Medium',
    status: 'Open',
    notes: '',
    done: false,
  };
}

function newDocument(): WoodsDriveDocument {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `woods-document-${Date.now()}`;
  return {
    id,
    title: '',
    category: '',
    url: '',
    path: '',
    notes: '',
    status: 'Needs selection',
  };
}

function AutosizeTextarea({
  className,
  value,
  onChange,
  placeholder,
}: {
  className: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      className={className}
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}

export function WoodsDriveChecklist({
  initialActions,
  initialDocuments,
}: {
  initialActions: WoodsDriveAction[];
  initialDocuments: WoodsDriveDocument[];
}) {
  const [actions, setActions] = useState<WoodsDriveAction[]>(initialActions);
  const [documents, setDocuments] = useState<WoodsDriveDocument[]>(initialDocuments);
  const [activePanel, setActivePanel] = useState<'actions' | 'documents' | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [message, setMessage] = useState('');
  const [dropboxPath, setDropboxPath] = useState(defaultDropboxPath);
  const [dropboxEntries, setDropboxEntries] = useState<DropboxEntry[]>([]);
  const [dropboxParentPath, setDropboxParentPath] = useState('');
  const [selectedDropboxPaths, setSelectedDropboxPaths] = useState<string[]>([]);
  const [dropboxMessage, setDropboxMessage] = useState('');
  const [showDropboxBrowser, setShowDropboxBrowser] = useState(false);
  const [isBrowsingDropbox, setIsBrowsingDropbox] = useState(false);
  const [isPending, startTransition] = useTransition();

  const openCount = useMemo(() => actions.filter((action) => !action.done).length, [actions]);
  const filteredActions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return actions.filter((action) => {
      const status = action.done ? 'Done' : action.status || 'Open';
      const matchesStatus = statusFilter === 'All' || status === statusFilter;
      const haystack = [
        action.sourceId,
        action.phase,
        action.text,
        action.responsible,
        action.dueDate,
        action.priority,
        action.status,
        action.notes,
      ].join(' ').toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [actions, query, statusFilter]);

  function updateAction(id: string, patch: Partial<WoodsDriveAction>) {
    setActions((current) => current.map((action) => action.id === id ? { ...action, ...patch } : action));
  }

  function addAction() {
    setQuery('');
    setStatusFilter('All');
    setActions((current) => [newAction(), ...current]);
    setMessage('Added action locally. Save changes when ready.');
  }

  function removeAction(id: string) {
    setActions((current) => current.filter((action) => action.id !== id));
  }

  function updateDocument(id: string, patch: Partial<WoodsDriveDocument>) {
    setDocuments((current) => current.map((document) => document.id === id ? { ...document, ...patch } : document));
  }

  function removeDocument(id: string) {
    setDocuments((current) => current.filter((document) => document.id !== id));
  }

  async function browseDropbox(path = dropboxPath) {
    setShowDropboxBrowser(true);
    setDropboxMessage('');
    setIsBrowsingDropbox(true);
    try {
      const response = await fetch(`/mission-control/api/woods-drive/dropbox?path=${encodeURIComponent(path)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDropboxMessage(data.error || 'Could not browse Dropbox.');
        return;
      }
      setDropboxPath(data.path || '');
      setDropboxParentPath(data.parentPath || '');
      setDropboxEntries(Array.isArray(data.entries) ? data.entries : []);
      setSelectedDropboxPaths([]);
      if (!Array.isArray(data.entries) || data.entries.length === 0) {
        setDropboxMessage('This Dropbox folder is empty.');
      }
    } catch (error) {
      setDropboxMessage(error instanceof Error ? error.message : 'Could not browse Dropbox.');
    } finally {
      setIsBrowsingDropbox(false);
    }
  }

  function toggleDropboxFile(path: string) {
    setSelectedDropboxPaths((current) => current.includes(path)
      ? current.filter((item) => item !== path)
      : [...current, path]);
  }

  function addSelectedDropboxDocuments() {
    const selectedEntries = dropboxEntries.filter((entry) => !entry.isDir && selectedDropboxPaths.includes(entry.path));
    if (selectedEntries.length === 0) {
      setDropboxMessage('Select one or more Dropbox files first.');
      return;
    }

    const existingPaths = new Set(documents.map((document) => document.path));
    const additions = selectedEntries
      .filter((entry) => !existingPaths.has(`/${entry.path}`))
      .map<WoodsDriveDocument>((entry, index) => ({
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `woods-dropbox-document-${Date.now()}-${index}`,
        title: entry.name,
        category: 'Dropbox',
        url: '',
        path: `/${entry.path}`,
        notes: entry.modifiedAt ? `Dropbox file modified ${entry.modifiedAt.slice(0, 10)}` : 'Dropbox file selected from browser.',
        status: 'Selected',
      }));

    if (additions.length === 0) {
      setDropboxMessage('Those files are already in the document list.');
      return;
    }

    setDocuments((current) => [...current, ...additions]);
    setSelectedDropboxPaths([]);
    setDropboxMessage(`Added ${additions.length} document${additions.length === 1 ? '' : 's'} locally. Save documents when ready.`);
  }

  function documentOpenHref(document: WoodsDriveDocument) {
    if (document.url.trim()) return document.url.trim();
    if (!document.path.trim()) return '';
    return `/mission-control/api/woods-drive/dropbox/open?path=${encodeURIComponent(document.path)}`;
  }

  function saveActions(nextActions = actions) {
    setMessage('');
    startTransition(async () => {
      const response = await fetch('/mission-control/api/woods-drive/checklist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: nextActions }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || 'Could not save Woods Drive actions.');
        return;
      }

      setActions(data.actions || []);
      setMessage('Saved.');
    });
  }

  function saveDocuments(nextDocuments = documents) {
    setMessage('');
    startTransition(async () => {
      const response = await fetch('/mission-control/api/woods-drive/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: nextDocuments }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || 'Could not save Woods Drive documents.');
        return;
      }

      setDocuments(data.documents || []);
      setMessage('Saved.');
    });
  }

  if (!activePanel) {
    return (
      <section className="woods-action-launch">
        <button className="woods-action-open-button" type="button" onClick={() => setActivePanel('actions')}>
          Action
        </button>
        <button className="woods-action-open-button" type="button" onClick={() => setActivePanel('documents')}>
          Document
        </button>
        <span className="muted small">{openCount} open / {actions.length} total / {documents.length} docs</span>
      </section>
    );
  }

  if (activePanel === 'documents') {
    return (
      <section className="card woods-checklist-card">
        <div className="section-title woods-section-title">
          <div>
            <h2>Critical documents</h2>
            <p className="muted small">{documents.length} project document links</p>
          </div>
          <div className="footer-actions">
            <button className="button secondary" type="button" onClick={() => browseDropbox()}>
              {showDropboxBrowser ? 'Reload Dropbox' : 'Browse Dropbox'}
            </button>
            <button className="button secondary" type="button" onClick={() => setDocuments((current) => [...current, newDocument()])}>
              + Add document
            </button>
            <button className="button" type="button" onClick={() => saveDocuments()} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save documents'}
            </button>
            <button className="button secondary" type="button" onClick={() => setActivePanel(null)}>
              Close
            </button>
          </div>
        </div>

        {showDropboxBrowser ? (
          <div className="woods-dropbox-browser">
            <div className="woods-dropbox-path-row">
              <input
                className="input woods-dropbox-path-input"
                value={dropboxPath}
                onChange={(event) => setDropboxPath(event.target.value)}
                placeholder="Dropbox folder path"
              />
              <button className="button secondary" type="button" onClick={() => browseDropbox(dropboxParentPath || defaultDropboxPath)} disabled={isBrowsingDropbox || !dropboxPath}>
                Up
              </button>
              <button className="button" type="button" onClick={() => browseDropbox()} disabled={isBrowsingDropbox}>
                {isBrowsingDropbox ? 'Loading...' : 'Open'}
              </button>
              <button className="button secondary" type="button" onClick={() => setShowDropboxBrowser(false)} disabled={isBrowsingDropbox}>
                Hide
              </button>
            </div>
            {dropboxEntries.length > 0 ? (
              <div className="woods-dropbox-entries" aria-label="Dropbox browser">
                {dropboxEntries.map((entry) => (
                  <div className="woods-dropbox-entry" key={entry.id}>
                    {entry.isDir ? (
                      <button className="woods-dropbox-folder" type="button" onClick={() => browseDropbox(entry.path)}>
                        <span aria-hidden="true">▸</span>
                        <span>{entry.name}</span>
                      </button>
                    ) : (
                      <label className="woods-dropbox-file">
                        <input
                          type="checkbox"
                          checked={selectedDropboxPaths.includes(entry.path)}
                          onChange={() => toggleDropboxFile(entry.path)}
                        />
                        <span>{entry.name}</span>
                      </label>
                    )}
                    <span className="muted small woods-dropbox-entry-meta">
                      {entry.isDir ? 'Folder' : entry.modifiedAt ? entry.modifiedAt.slice(0, 10) : 'File'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="reference-empty-card compact-empty">
                {isBrowsingDropbox ? 'Loading Dropbox...' : 'Open a Dropbox folder to select files.'}
              </div>
            )}
            <div className="woods-dropbox-footer">
              <button className="button secondary" type="button" onClick={addSelectedDropboxDocuments} disabled={selectedDropboxPaths.length === 0}>
                Add selected
              </button>
              <span className="muted small">{selectedDropboxPaths.length} selected</span>
              {dropboxMessage ? <span className="muted small woods-dropbox-message">{dropboxMessage}</span> : null}
            </div>
          </div>
        ) : null}

        <div className="woods-document-list">
          {documents.map((document) => (
            <article className="woods-document-row" key={document.id}>
              <div className="woods-document-main">
                <input className="input woods-cell-input woods-document-title-input" value={document.title} onChange={(event) => updateDocument(document.id, { title: event.target.value })} placeholder="Document title" />
                {documentOpenHref(document) ? (
                  <a className="button secondary woods-document-open-link" href={documentOpenHref(document)} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  <button className="button secondary woods-document-open-link" type="button" disabled>
                    Open
                  </button>
                )}
                <button className="compact-task-button delete woods-document-remove-button" type="button" onClick={() => removeDocument(document.id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
        {message ? <p className="muted small woods-save-message">{message}</p> : null}
      </section>
    );
  }

  return (
    <section className="card woods-checklist-card">
      <div className="section-title woods-section-title">
        <div>
          <h2>Action register</h2>
          <p className="muted small">{openCount} open / {actions.length} total</p>
        </div>
        <div className="footer-actions">
          <button className="button secondary" type="button" onClick={addAction}>
            + Add action
          </button>
          <button className="button secondary" type="button" onClick={() => setActivePanel(null)}>
            Close
          </button>
          <button className="button" type="button" onClick={() => saveActions()} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

          <div className="woods-toolbar">
            <input
              className="input woods-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actions"
            />
            <select className="input woods-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <span className="muted small woods-filter-count">{filteredActions.length} shown</span>
          </div>

          <div className="woods-table-wrap">
            {actions.length ? (
              <table className="woods-action-table">
                <thead>
                  <tr>
                    <th className="woods-col-phase">Phase</th>
                    <th className="woods-col-action">Action</th>
                    <th className="woods-col-owner">Responsible</th>
                    <th className="woods-col-due">Due by</th>
                    <th className="woods-col-priority">Priority</th>
                    <th className="woods-col-notes">Notes</th>
                    <th className="woods-col-remove"></th>
                    <th className="woods-col-complete">Complete</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActions.map((action) => (
                    <tr className={action.done ? 'is-done' : ''} key={action.id}>
                      <td className="woods-col-phase">
                        <input className="input woods-cell-input" value={action.phase} onChange={(event) => updateAction(action.id, { phase: event.target.value })} placeholder="Phase" />
                      </td>
                      <td className="woods-col-action">
                        <AutosizeTextarea
                          className="input woods-cell-textarea woods-action-text"
                          value={action.text}
                          onChange={(text) => updateAction(action.id, { text })}
                          placeholder="Describe the action"
                        />
                      </td>
                      <td className="woods-col-owner">
                        <input
                          className="input woods-cell-input"
                          value={action.responsible}
                          onChange={(event) => updateAction(action.id, { responsible: event.target.value })}
                          placeholder="Person responsible"
                        />
                      </td>
                      <td className="woods-col-due">
                        <input
                          className="input woods-cell-input"
                          type="date"
                          value={dateInputValue(action.dueDate)}
                          onChange={(event) => updateAction(action.id, { dueDate: event.target.value })}
                        />
                        {!dateInputValue(action.dueDate) && action.dueDate ? <span className="woods-due-note">{action.dueDate}</span> : null}
                      </td>
                      <td className="woods-col-priority">
                        <select className="input woods-cell-input" value={action.priority} onChange={(event) => updateAction(action.id, { priority: event.target.value })}>
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                          <option value="">Unassigned</option>
                        </select>
                      </td>
                      <td className="woods-col-notes">
                        <AutosizeTextarea
                          className="input woods-cell-textarea woods-action-notes"
                          value={action.notes}
                          onChange={(notes) => updateAction(action.id, { notes })}
                          placeholder="Supporting notes"
                        />
                      </td>
                      <td className="woods-col-remove">
                        <button className="compact-task-button delete woods-remove-action" type="button" onClick={() => removeAction(action.id)}>
                          Remove
                        </button>
                      </td>
                      <td className="woods-col-complete">
                        <label className="woods-action-complete">
                          <input
                            checked={action.done}
                            aria-label={`Mark ${action.sourceId || 'action'} complete`}
                            type="checkbox"
                            onChange={(event) => updateAction(action.id, { done: event.target.checked, status: event.target.checked ? 'Done' : 'Open' })}
                          />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="reference-empty-card compact-empty">
                Add the first Woods Drive action when you are ready.
              </div>
            )}
          </div>

      {message ? <p className="muted small woods-save-message">{message}</p> : null}
    </section>
  );
}
