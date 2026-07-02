"use client";

import { useMemo, useState, useTransition } from 'react';
import { TaskItem, TaskPriority, TaskScope } from '@/lib/types';

const emptyDraft = {
  title: '',
  domain: 'general',
  scope: 'personal' as TaskScope,
  dueDate: new Date().toISOString().slice(0, 10),
  dueTime: '',
  priority: 'medium' as TaskPriority,
  project: '',
  notes: '',
};

type SortMode = 'dueDate' | 'priority' | 'title';
type StatusFilter = 'all' | 'open' | 'done';
type SavedView = 'all' | 'today' | 'thisWeek' | 'highPriority' | 'reviewCreated';

const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
function sortTasks(tasks: TaskItem[], mode: SortMode) {
  const sorted = [...tasks];
  if (mode === 'priority') return sorted.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? '').localeCompare(b.dueTime ?? ''));
  if (mode === 'title') return sorted.sort((a, b) => a.title.localeCompare(b.title));
  return sorted.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? '').localeCompare(b.dueTime ?? ''));
}
function daysFromNow(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }

export function TaskPanel({ initialTasks }: { initialTasks: TaskItem[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [draft, setDraft] = useState(emptyDraft);
  const [naturalText, setNaturalText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TaskItem>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | TaskScope>('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('dueDate');
  const [savedView, setSavedView] = useState<SavedView>('all');
  const [isPending, startTransition] = useTransition();

  const domains = useMemo(() => Array.from(new Set(tasks.map((task) => task.domain))).sort(), [tasks]);
  const visibleTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = daysFromNow(7);
    const filtered = tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (scopeFilter !== 'all' && task.scope !== scopeFilter) return false;
      if (domainFilter !== 'all' && task.domain !== domainFilter) return false;
      if (savedView === 'today' && !(task.status === 'open' && task.dueDate === today)) return false;
      if (savedView === 'thisWeek' && !(task.status === 'open' && task.dueDate >= today && task.dueDate <= weekEnd)) return false;
      if (savedView === 'highPriority' && !(task.status === 'open' && task.priority === 'high')) return false;
      if (savedView === 'reviewCreated' && task.domain !== 'review') return false;
      return true;
    });
    return sortTasks(filtered, sortMode);
  }, [tasks, statusFilter, priorityFilter, scopeFilter, domainFilter, sortMode, savedView]);

  async function toggleTask(id: string) {
    startTransition(async () => {
      const response = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!response.ok) return;
      const { task } = await response.json();
      setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
    });
  }

  async function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    startTransition(async () => {
      const response = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title.trim(), domain: draft.domain, scope: draft.scope, dueDate: draft.dueDate, dueTime: draft.dueTime, priority: draft.priority, project: draft.project, notes: draft.notes }),
      });
      if (!response.ok) return;
      const { task } = await response.json();
      setTasks((current) => [task, ...current]);
      setDraft(emptyDraft);
    });
  }

  async function addNaturalLanguageTask() {
    if (!naturalText.trim()) return;
    startTransition(async () => {
      const response = await fetch('/api/tasks/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: naturalText.trim() }) });
      if (!response.ok) return;
      const { task } = await response.json();
      setTasks((current) => [task, ...current]);
      setNaturalText('');
    });
  }

  function beginEdit(task: TaskItem) { setEditingId(task.id); setEditDraft({ ...task }); }
  function cancelEdit() { setEditingId(null); setEditDraft({}); }

  async function saveEdit(id: string) {
    startTransition(async () => {
      const response = await fetch('/api/tasks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, mode: 'update', title: editDraft.title, priority: editDraft.priority, scope: editDraft.scope, domain: editDraft.domain, dueDate: editDraft.dueDate, dueTime: editDraft.dueTime, project: editDraft.project, notes: editDraft.notes }),
      });
      if (!response.ok) return;
      const { task } = await response.json();
      setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
      setEditingId(null);
      setEditDraft({});
    });
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <section className="card">
        <div className="section-title">
          <div>
            <h2>Capture a task</h2>
            <p className="muted small">You can now type structured details or just speak/type naturally and let the app translate it.</p>
          </div>
        </div>

        <div className="form" style={{ marginBottom: 18 }}>
          <textarea className="input" rows={4} value={naturalText} onChange={(e) => setNaturalText(e.target.value)} placeholder="Example: Add a high-priority business task for Friday at 10am to call the mechanic about the 4Runner. Notes: ask about timeline and cost." />
          <button className="button secondary" type="button" onClick={addNaturalLanguageTask} disabled={isPending || !naturalText.trim()}>{isPending ? 'Capturing…' : 'Capture from natural language'}</button>
        </div>

        <form className="form" onSubmit={addTask}>
          <input className="input" value={draft.title} onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))} placeholder="What needs doing?" />
          <div className="grid grid-4 compact-grid">
            <select className="select" value={draft.scope} onChange={(e) => setDraft((current) => ({ ...current, scope: e.target.value as TaskScope }))}>
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </select>
            <select className="select" value={draft.domain} onChange={(e) => setDraft((current) => ({ ...current, domain: e.target.value }))}>
              <option value="general">General</option><option value="memories">Memories</option><option value="documents">Documents</option><option value="creative">Creative</option><option value="review">Review</option>
            </select>
            <select className="select" value={draft.priority} onChange={(e) => setDraft((current) => ({ ...current, priority: e.target.value as TaskPriority }))}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
            <input className="input" type="date" value={draft.dueDate} onChange={(e) => setDraft((current) => ({ ...current, dueDate: e.target.value }))} />
          </div>
          <div className="grid grid-2 compact-grid">
            <input className="input" type="time" value={draft.dueTime} onChange={(e) => setDraft((current) => ({ ...current, dueTime: e.target.value }))} />
            <input className="input" value={draft.project} onChange={(e) => setDraft((current) => ({ ...current, project: e.target.value }))} placeholder="Project (optional)" />
          </div>
          <textarea className="input" rows={4} value={draft.notes} onChange={(e) => setDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes (optional)" />
          <button className="button" disabled={isPending} type="submit">{isPending ? 'Saving…' : 'Add task'}</button>
        </form>
      </section>

      <section className="card">
        <div className="section-title"><div><h2>Task queue</h2><p className="muted small">Saved views for the obvious slices, filters for the fussy refinements.</p></div></div>
        <div className="badge-row" style={{ marginBottom: 18 }}>
          <button className={`button secondary ${savedView === 'all' ? 'active-pill' : ''}`} type="button" onClick={() => setSavedView('all')}>All</button>
          <button className={`button secondary ${savedView === 'today' ? 'active-pill' : ''}`} type="button" onClick={() => setSavedView('today')}>Today</button>
          <button className={`button secondary ${savedView === 'thisWeek' ? 'active-pill' : ''}`} type="button" onClick={() => setSavedView('thisWeek')}>This week</button>
          <button className={`button secondary ${savedView === 'highPriority' ? 'active-pill' : ''}`} type="button" onClick={() => setSavedView('highPriority')}>High priority</button>
          <button className={`button secondary ${savedView === 'reviewCreated' ? 'active-pill' : ''}`} type="button" onClick={() => setSavedView('reviewCreated')}>Review-created</button>
        </div>
        <div className="grid grid-4 compact-grid" style={{ marginBottom: 18 }}>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}><option value="all">All statuses</option><option value="open">Open</option><option value="done">Done</option></select>
          <select className="select" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as 'all' | TaskScope)}><option value="all">All scopes</option><option value="personal">Personal</option><option value="business">Business</option></select>
          <select className="select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as 'all' | TaskPriority)}><option value="all">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
          <select className="select" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}><option value="all">All domains</option>{domains.map((domain) => (<option key={domain} value={domain}>{domain}</option>))}</select>
        </div>
        <div className="grid grid-2 compact-grid" style={{ marginBottom: 18 }}>
          <select className="select" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}><option value="dueDate">Sort by due date</option><option value="priority">Sort by priority</option><option value="title">Sort by title</option></select>
          <div className="badge-row"><span className="badge">{visibleTasks.length} shown</span><span className="badge">{tasks.filter((task) => task.status === 'open').length} open total</span><span className="badge">view: {savedView}</span></div>
        </div>
        <div className="list">
          {visibleTasks.map((task) => {
            const isEditing = editingId === task.id;
            return (
              <article className="item" key={task.id}>
                {isEditing ? (
                  <div className="form">
                    <input className="input" value={editDraft.title ?? ''} onChange={(e) => setEditDraft((current) => ({ ...current, title: e.target.value }))} />
                    <div className="grid grid-4 compact-grid">
                      <select className="select" value={(editDraft.scope as TaskScope) ?? 'personal'} onChange={(e) => setEditDraft((current) => ({ ...current, scope: e.target.value as TaskScope }))}><option value="personal">Personal</option><option value="business">Business</option></select>
                      <select className="select" value={editDraft.domain ?? 'general'} onChange={(e) => setEditDraft((current) => ({ ...current, domain: e.target.value }))}><option value="general">General</option><option value="memories">Memories</option><option value="documents">Documents</option><option value="creative">Creative</option><option value="review">Review</option></select>
                      <select className="select" value={(editDraft.priority as TaskPriority) ?? 'medium'} onChange={(e) => setEditDraft((current) => ({ ...current, priority: e.target.value as TaskPriority }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
                      <input className="input" type="date" value={editDraft.dueDate ?? ''} onChange={(e) => setEditDraft((current) => ({ ...current, dueDate: e.target.value }))} />
                    </div>
                    <div className="grid grid-2 compact-grid">
                      <input className="input" type="time" value={editDraft.dueTime ?? ''} onChange={(e) => setEditDraft((current) => ({ ...current, dueTime: e.target.value }))} />
                      <input className="input" value={editDraft.project ?? ''} onChange={(e) => setEditDraft((current) => ({ ...current, project: e.target.value }))} placeholder="Project" />
                    </div>
                    <textarea className="input" rows={4} value={editDraft.notes ?? ''} onChange={(e) => setEditDraft((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes" />
                    <div className="badge-row"><button className="button" type="button" onClick={() => saveEdit(task.id)} disabled={isPending}>{isPending ? 'Saving…' : 'Save changes'}</button><button className="button secondary" type="button" onClick={cancelEdit} disabled={isPending}>Cancel</button></div>
                  </div>
                ) : (
                  <>
                    <div className="item-top">
                      <div>
                        <h3>{task.title}</h3>
                        <p className="muted small">{task.scope} · {task.domain} · Due {task.dueDate}{task.dueTime ? ` at ${task.dueTime}` : ''}{task.project ? ` · ${task.project}` : ''}</p>
                      </div>
                      <span className="tag">{task.priority}</span>
                    </div>
                    {task.notes ? <p className="muted">{task.notes}</p> : null}
                    <div className="section-title" style={{ marginBottom: 0 }}><span className="badge">{task.status}</span><div className="badge-row"><button className="button secondary" type="button" onClick={() => beginEdit(task)} disabled={isPending}>Edit</button><button className="button secondary" type="button" onClick={() => toggleTask(task.id)} disabled={isPending}>Mark as {task.status === 'open' ? 'done' : 'open'}</button></div></div>
                  </>
                )}
              </article>
            );
          })}
          {visibleTasks.length === 0 ? <p className="muted">No tasks match the current filters.</p> : null}
        </div>
      </section>
    </div>
  );
}
