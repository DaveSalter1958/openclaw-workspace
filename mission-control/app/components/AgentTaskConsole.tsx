"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';

type AgentTask = {
  id: string;
  title: string;
  dueLabel?: string;
  priority: 'low' | 'medium' | 'high';
  project: string;
  notes?: string;
};

type AgentWorkItem = {
  title: string;
  detail?: string;
};

type AgentActivity = {
  agent: string;
  sessionCount: number;
  activeLabel: string;
  status: 'active' | 'idle';
  store?: string;
  tasks: AgentTask[];
  kind?: string;
  sessionKey?: string;
  displayName?: string;
  model?: string;
  channel?: string;
  updatedAt?: string;
  transcriptPath?: string;
  workItems?: AgentWorkItem[];
};

type Props = {
  initialTasks: AgentTask[];
  initialActivities: AgentActivity[];
};

function sessionId(activity: AgentActivity) {
  return activity.sessionKey || `${activity.agent}-${activity.updatedAt || activity.displayName || 'session'}`;
}

function sessionTitle(activity: AgentActivity, index: number) {
  const label = activity.kind === 'subagent' ? 'Subagent' : 'Main session';
  const key = activity.sessionKey ? activity.sessionKey.slice(0, 8) : String(index + 1);
  return `${label} ${key}`;
}

function statusLabel(status: AgentActivity['status']) {
  return status === 'active' ? 'Active' : 'Idle';
}

export function AgentTaskConsole({ initialTasks, initialActivities }: Props) {
  const [tasks] = useState(initialTasks);
  const [activities] = useState(initialActivities);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialActivities[0] ? sessionId(initialActivities[0]) : null);

  const visibleTasks = useMemo(() => tasks.slice(0, 8), [tasks]);
  const selectedAgentCard = activities.find((activity) => sessionId(activity) === selectedSessionId) ?? activities[0] ?? null;
  const selectedIndex = selectedAgentCard ? activities.findIndex((activity) => sessionId(activity) === sessionId(selectedAgentCard)) : -1;
  const activeCount = activities.filter((activity) => activity.status === 'active').length;
  const subagentCount = activities.filter((activity) => activity.kind === 'subagent').length;

  return (
    <main className="reference-dashboard agent-simple-page">
      <section className="card agent-simple-header">
        <div>
          <p className="eyebrow">Agent Tasks</p>
          <h1>Agent activity</h1>
          <p className="muted small">Recent Guy and subagent sessions, plus any tasks that look like agent work.</p>
        </div>
        <div className="agent-simple-summary">
          <div><strong>{activities.length}</strong><span>Sessions</span></div>
          <div><strong>{activeCount}</strong><span>Active</span></div>
          <div><strong>{subagentCount}</strong><span>Subagents</span></div>
          <div><strong>{visibleTasks.length}</strong><span>Tasks</span></div>
        </div>
      </section>

      <section className="agent-simple-layout">
        <section className="card">
          <div className="section-title agent-section-title">
            <div>
              <h2>Recent sessions</h2>
              <p className="muted small">Newest sessions first. Click one to see the last captured work snippets.</p>
            </div>
          </div>

          <div className="agent-simple-session-list">
            {activities.length ? activities.map((activity, index) => {
              const id = sessionId(activity);
              const selected = id === selectedSessionId;
              return (
                <button
                  key={id}
                  type="button"
                  className={`agent-simple-session ${selected ? 'selected' : ''}`}
                  onClick={() => setSelectedSessionId(id)}
                >
                  <div className="agent-simple-session-main">
                    <span className={`agent-simple-status ${activity.status}`}>{statusLabel(activity.status)}</span>
                    <div>
                      <h3>{sessionTitle(activity, index)}</h3>
                      <p>{activity.activeLabel}{activity.channel ? ` · ${activity.channel}` : ''}</p>
                    </div>
                  </div>
                  <span className="agent-simple-kind">{activity.kind || 'session'}</span>
                </button>
              );
            }) : <div className="reference-empty-card compact-empty">No recent agent sessions detected.</div>}
          </div>
        </section>

        <aside className="card agent-simple-detail">
          <div className="section-title agent-section-title">
            <div>
              <h2>Session detail</h2>
              <p className="muted small">Plain summary of the selected session.</p>
            </div>
          </div>

          {selectedAgentCard ? (
            <div className="agent-simple-detail-body">
              <div>
                <p className="eyebrow">Selected</p>
                <h3>{sessionTitle(selectedAgentCard, selectedIndex >= 0 ? selectedIndex : 0)}</h3>
                <p className="muted small">Last activity: {selectedAgentCard.activeLabel}</p>
              </div>

              <dl className="agent-simple-facts">
                <div><dt>Status</dt><dd>{statusLabel(selectedAgentCard.status)}</dd></div>
                {selectedAgentCard.model ? <div><dt>Model</dt><dd>{selectedAgentCard.model}</dd></div> : null}
                {selectedAgentCard.channel ? <div><dt>Channel</dt><dd>{selectedAgentCard.channel}</dd></div> : null}
                {selectedAgentCard.sessionKey ? <div><dt>Session</dt><dd>{selectedAgentCard.sessionKey}</dd></div> : null}
              </dl>

              <div>
                <p className="eyebrow">Recent work</p>
                {selectedAgentCard.workItems?.length ? (
                  <ul className="agent-simple-work-list">
                    {selectedAgentCard.workItems.map((item, index) => (
                      <li key={`${sessionId(selectedAgentCard)}-work-${index}`}>
                        <strong>{item.title}</strong>
                        {item.detail ? <span>{item.detail}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted small">No recent work snippet captured yet.</p>}
              </div>
            </div>
          ) : <p className="muted small">No agent session selected.</p>}
        </aside>
      </section>

      <section className="card">
        <div className="section-title agent-section-title">
          <div>
            <h2>Agent task queue</h2>
            <p className="muted small">Open tasks currently tagged or behaving like work for Guy.</p>
          </div>
          <Link className="button secondary" href="/tasks/new">New task</Link>
        </div>

        <div className="agent-simple-task-list">
          {visibleTasks.length ? visibleTasks.map((task) => (
            <Link key={task.id} href={`/tasks/${task.id}?from=agent-tasks`} className="agent-simple-task-row">
              <div>
                <h3>{task.title}</h3>
                <p>{task.notes || task.project}</p>
              </div>
              <div className="agent-simple-task-meta">
                <span>{task.project}</span>
                <span>{task.dueLabel || task.priority}</span>
              </div>
            </Link>
          )) : <div className="reference-empty-card compact-empty">No active agent tasks yet.</div>}
        </div>
      </section>
    </main>
  );
}
