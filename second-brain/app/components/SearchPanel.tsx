"use client";

import { useMemo, useState } from 'react';
import { DocumentItem, MemoryItem, TaskItem } from '@/lib/types';

type SearchPanelProps = {
  memories: MemoryItem[];
  documents: DocumentItem[];
  tasks: TaskItem[];
};

function normalize(value: string) {
  return value.toLowerCase().trim();
}

export function SearchPanel({ memories, documents, tasks }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const q = normalize(query);

  const filtered = useMemo(() => {
    if (!q) {
      return {
        memories: memories.slice(0, 8),
        documents: documents.slice(0, 12),
        tasks: tasks.slice(0, 8),
      };
    }

    return {
      memories: memories.filter((memory) =>
        [memory.title, memory.summary, memory.date, memory.source, ...memory.tags].some((field) =>
          normalize(field).includes(q),
        ),
      ),
      documents: documents.filter((document) =>
        [document.title, document.summary, document.type, document.source, document.path ?? ''].some((field) =>
          normalize(field).includes(q),
        ),
      ),
      tasks: tasks.filter((task) =>
        [task.title, task.domain, task.status, task.priority, task.dueDate].some((field) =>
          normalize(field).includes(q),
        ),
      ),
    };
  }, [documents, memories, q, tasks]);

  return (
    <div className="grid" style={{ gap: 18 }}>
      <section className="card">
        <div className="section-title">
          <div>
            <h2>Search everything</h2>
            <p className="muted small">Memories, workspace docs, Dropbox index, and tasks in one bluntly useful place.</p>
          </div>
        </div>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search memories, documents, Dropbox paths, tasks…"
        />
      </section>

      <section className="grid grid-3">
        <div className="card">
          <div className="section-title">
            <div>
              <h2>Memories</h2>
              <p className="muted small">{filtered.memories.length} result(s)</p>
            </div>
          </div>
          <div className="list">
            {filtered.memories.length > 0 ? filtered.memories.map((memory) => (
              <article className="item" key={memory.id}>
                <h3>{memory.title}</h3>
                <p className="muted small">{memory.date} · {memory.source}</p>
                <p className="muted">{memory.summary}</p>
              </article>
            )) : <p className="muted">No memory matches.</p>}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h2>Documents</h2>
              <p className="muted small">{filtered.documents.length} result(s)</p>
            </div>
          </div>
          <div className="list">
            {filtered.documents.length > 0 ? filtered.documents.map((document) => (
              <article className="item" key={document.id}>
                <h3>{document.title}</h3>
                <p className="muted small">{document.type} · {document.source}</p>
                <p className="muted">{document.summary}</p>
                {document.path ? <p className="muted small">{document.path}</p> : null}
              </article>
            )) : <p className="muted">No document matches.</p>}
          </div>
        </div>

        <div className="card">
          <div className="section-title">
            <div>
              <h2>Tasks</h2>
              <p className="muted small">{filtered.tasks.length} result(s)</p>
            </div>
          </div>
          <div className="list">
            {filtered.tasks.length > 0 ? filtered.tasks.map((task) => (
              <article className="item" key={task.id}>
                <h3>{task.title}</h3>
                <p className="muted small">{task.domain} · {task.status} · due {task.dueDate}</p>
              </article>
            )) : <p className="muted">No task matches.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
