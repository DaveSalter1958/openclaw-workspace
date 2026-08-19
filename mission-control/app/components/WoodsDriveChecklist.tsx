"use client";

import { useMemo, useState, useTransition } from 'react';
import type { WoodsDriveAction, WoodsDriveDocument } from '@/lib/woods-drive';

const statusOptions = ['All', 'Open', 'In progress', 'Waiting', 'Done'];
const defaultDropboxPath = 'DRSEng/1 - DRS Eng - Projects/2025/2025-202 1643 Woods Drive - SRS';
type ActionSortKey = 'by' | 'date' | 'priority';
type SortDirection = 'asc' | 'desc';

type DropboxEntry = {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  mimeType: string;
  modifiedAt: string;
};

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
    priority: '',
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

function priorityClass(priority: string) {
  const normalized = priority.trim().toLowerCase();
  if (normalized === 'urgent') return 'is-priority-urgent';
  if (normalized === 'high') return 'is-priority-high';
  if (normalized === 'medium') return 'is-priority-medium';
  if (normalized === 'low') return 'is-priority-low';
  return 'is-priority-unassigned';
}

function isOverdue(dueDate: string) {
  const trimmed = dueDate.trim();
  if (!trimmed || trimmed.toLowerCase() === 'asap') return false;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed < today;
}

function dateInputValue(dueDate: string) {
  const trimmed = dueDate.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function monthDayLabel(dueDate: string) {
  const value = dateInputValue(dueDate);
  if (!value) return '';
  const [, month, day] = value.split('-');
  return `${month}/${day}`;
}

function priorityRank(priority: string) {
  const normalized = priority.trim().toLowerCase();
  if (normalized === 'urgent') return 0;
  if (normalized === 'high') return 1;
  if (normalized === 'medium') return 2;
  if (normalized === 'low') return 3;
  return 4;
}

function dueDateRank(dueDate: string) {
  const value = dateInputValue(dueDate);
  if (!value) return Number.POSITIVE_INFINITY;
  return new Date(`${value}T00:00:00`).getTime();
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
  const [sortKey, setSortKey] = useState<ActionSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isPending, startTransition] = useTransition();

  const openCount = useMemo(() => actions.filter((action) => !action.done).length, [actions]);
  const highPriorityCount = useMemo(
    () => actions.filter((action) => !action.done && action.priority.trim().toLowerCase() === 'high').length,
    [actions],
  );
  const overdueCount = useMemo(
    () => actions.filter((action) => !action.done && isOverdue(action.dueDate)).length,
    [actions],
  );
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
  const visibleActions = useMemo(() => {
    if (!sortKey) return filteredActions;

    return [...filteredActions].sort((left, right) => {
      let comparison = 0;
      if (sortKey === 'by') {
        comparison = left.responsible.localeCompare(right.responsible, undefined, { sensitivity: 'base' });
      } else if (sortKey === 'date') {
        comparison = dueDateRank(left.dueDate) - dueDateRank(right.dueDate);
      } else {
        comparison = priorityRank(left.priority) - priorityRank(right.priority);
      }

      if (comparison === 0) {
        comparison = left.text.localeCompare(right.text, undefined, { sensitivity: 'base' });
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredActions, sortDirection, sortKey]);

  function sortLabel(key: ActionSortKey) {
    if (sortKey !== key) return '-';
    return sortDirection === 'asc' ? '^' : 'v';
  }

  function toggleSort(key: ActionSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(key);
    setSortDirection('asc');
  }

  function updateAction(id: string, patch: Partial<WoodsDriveAction>) {
    setActions((current) => current.map((action) => action.id === id ? { ...action, ...patch } : action));
  }

  function addAction() {
    setQuery('');
    setStatusFilter('All');
    setActions((current) => [newAction(), ...current]);
    setMessage('Added action locally. Save changes when ready.');
  }

  function completeAction(id: string) {
    const action = actions.find((item) => item.id === id);
    const label = action?.text?.trim() || action?.sourceId || 'this action';
    const confirmed = window.confirm(`Completing "${label}" will remove it from the action list.\n\nYes: remove it\nNo: keep it`);
    if (!confirmed) return;

    const nextActions = actions.filter((item) => item.id !== id);
    setActions(nextActions);
    saveActions(nextActions);
  }

  function removeAction(id: string) {
    const action = actions.find((item) => item.id === id);
    const label = action?.text?.trim() || action?.sourceId || 'this action';
    const confirmed = window.confirm(`Remove "${label}" from the action list?`);
    if (!confirmed) return;

    const nextActions = actions.filter((item) => item.id !== id);
    setActions(nextActions);
    saveActions(nextActions);
  }

  function updateDocument(id: string, patch: Partial<WoodsDriveDocument>) {
    setDocuments((current) => current.map((document) => document.id === id ? { ...document, ...patch } : document));
  }

  function removeDocument(id: string) {
    const document = documents.find((item) => item.id === id);
    const label = document?.title?.trim() || document?.path?.trim() || 'this document';
    const confirmed = window.confirm(`Remove "${label}" from the document section?\n\nThis only removes it from Mission Control. Dropbox is not changed.`);
    if (!confirmed) return;

    setDocuments((current) => current.filter((document) => document.id !== id));
    setMessage('Removed document locally. Save documents when ready.');
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
      <div className="woods-register-header">
        <div className="woods-register-title">
          <span className="woods-register-icon" aria-hidden="true" />
          <h2>Project Action Register</h2>
          <span className="woods-register-badge is-open">{openCount} open</span>
          <span className="woods-register-badge is-high">{highPriorityCount} high priority</span>
          <span className="woods-register-badge is-overdue">{overdueCount} overdue</span>
        </div>
        <div className="woods-register-actions">
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
            <span className="muted small woods-filter-count">{visibleActions.length} shown</span>
          </div>

          <div className="woods-table-wrap">
            {actions.length ? (
              <table className="woods-action-table">
                <thead>
                  <tr>
                    <th className="woods-col-action">Action</th>
                    <th className="woods-col-owner">
                      <button className="woods-sort-button" type="button" onClick={() => toggleSort('by')}>
                        By <span>{sortLabel('by')}</span>
                      </button>
                    </th>
                    <th className="woods-col-due">
                      <button className="woods-sort-button" type="button" onClick={() => toggleSort('date')}>
                        Date <span>{sortLabel('date')}</span>
                      </button>
                    </th>
                    <th className="woods-col-priority">
                      <button className="woods-sort-button" type="button" onClick={() => toggleSort('priority')}>
                        Priority <span>{sortLabel('priority')}</span>
                      </button>
                    </th>
                    <th className="woods-col-complete">Status</th>
                    <th className="woods-col-remove">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActions.map((action) => (
                    <tr className={action.done ? 'is-done' : ''} key={action.id}>
                      <td className="woods-col-action">
                        <textarea
                          className="input woods-cell-input woods-cell-textarea woods-action-text"
                          rows={2}
                          value={action.text}
                          onChange={(event) => updateAction(action.id, { text: event.target.value })}
                          placeholder="Describe the action"
                        />
                      </td>
                      <td className="woods-col-owner">
                        <div className="woods-owner-cell">
                          <textarea
                            className="input woods-cell-input woods-cell-textarea woods-responsible-input"
                            rows={2}
                            value={action.responsible}
                            onChange={(event) => updateAction(action.id, { responsible: event.target.value })}
                            placeholder="Name"
                            autoComplete="name"
                          />
                        </div>
                      </td>
                      <td className="woods-col-due">
                        <label className="woods-date-picker">
                          <span>{monthDayLabel(action.dueDate) || 'mm/dd'}</span>
                          <input
                            type="date"
                            value={dateInputValue(action.dueDate)}
                            onChange={(event) => updateAction(action.id, { dueDate: event.target.value })}
                            aria-label="Due date"
                          />
                        </label>
                      </td>
                      <td className="woods-col-priority">
                        <select className={`input woods-cell-input woods-priority-select ${priorityClass(action.priority)}`} value={action.priority === 'None' ? '' : action.priority} onChange={(event) => updateAction(action.id, { priority: event.target.value })}>
                          <option value="Urgent">Urgent</option>
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                          <option value="">None</option>
                        </select>
                      </td>
                      <td className="woods-col-complete">
                        <button className="woods-status-button" type="button" onClick={() => completeAction(action.id)}>
                          <span aria-hidden="true">✓</span>
                          Open
                        </button>
                      </td>
                      <td className="woods-col-remove">
                        <button className="woods-remove-action-button" type="button" onClick={() => removeAction(action.id)}>
                          Remove
                        </button>
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
