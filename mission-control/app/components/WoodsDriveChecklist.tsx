"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { WoodsDriveAction } from '@/lib/woods-drive';

const statusOptions = ['All', 'Open', 'In progress', 'Waiting', 'Done'];
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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

export function WoodsDriveChecklist({ initialActions }: { initialActions: WoodsDriveAction[] }) {
  const [actions, setActions] = useState<WoodsDriveAction[]>(initialActions);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [message, setMessage] = useState('');
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

  function removeAction(id: string) {
    setActions((current) => current.filter((action) => action.id !== id));
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

  if (!isOpen) {
    return (
      <section className="woods-action-launch">
        <button className="woods-action-open-button" type="button" onClick={() => setIsOpen(true)}>
          Action
        </button>
        <span className="muted small">{openCount} open / {actions.length} total</span>
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
          <button className="button secondary" type="button" onClick={() => setActions((current) => [...current, newAction()])}>
            + Add action
          </button>
          <button className="button secondary" type="button" onClick={() => setIsOpen(false)}>
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
