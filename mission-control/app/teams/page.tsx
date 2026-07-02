import { getTaskBoard } from '@/lib/data';

export const dynamic = 'force-dynamic';

type TeamMember = {
  name: string;
  emoji: string;
  role: string;
  kind: 'Agent' | 'Subagent' | 'Automation';
  focus: string;
  cadence: string;
  status: 'standing by' | 'scheduled' | 'active';
};

const teamMembers: TeamMember[] = [
  {
    name: 'Guy',
    emoji: '⚙️',
    role: 'COO and technical partner',
    kind: 'Agent',
    focus: 'Orchestrates work, delegates non-trivial tasks, watches quality, and gives Dave the decision-ready version.',
    cadence: 'Always on',
    status: 'active',
  },
  {
    name: 'PlanHubGuy',
    emoji: '📬',
    role: 'Proposal inbox operator',
    kind: 'Automation',
    focus: 'Reviews PlanHub replies, drafts responses, watches queues, and keeps DRS proposal work moving.',
    cadence: 'Daily',
    status: 'scheduled',
  },
  {
    name: 'Security Sentinel',
    emoji: '🛡️',
    role: 'Host exposure auditor',
    kind: 'Subagent',
    focus: 'Checks open ports, gateway auth, localhost binding, SSH posture, firewall rules, and exposed services.',
    cadence: '7:00 AM',
    status: 'scheduled',
  },
  {
    name: 'Patchwright',
    emoji: '🧰',
    role: 'Security fixer',
    kind: 'Subagent',
    focus: 'Reads the security audit and fixes critical or high severity issues when the remediation is reversible.',
    cadence: '7:30 AM',
    status: 'scheduled',
  },
  {
    name: 'Keymaster',
    emoji: '🔑',
    role: 'API key auditor',
    kind: 'Subagent',
    focus: 'Validates configured API keys, checks usage and spend, and flags broken keys or unusual cost spikes.',
    cadence: '8:00 AM',
    status: 'scheduled',
  },
  {
    name: 'Cron Marshal',
    emoji: '⏱️',
    role: 'Schedule supervisor',
    kind: 'Subagent',
    focus: 'Monitors registered cron jobs, catches failures or silent removals, and restarts safe jobs when needed.',
    cadence: '9:00 AM',
    status: 'scheduled',
  },
  {
    name: 'Archive Clerk',
    emoji: '🗄️',
    role: 'Workspace backup runner',
    kind: 'Automation',
    focus: 'Commits workspace changes with timestamped messages and pushes the private GitHub backup.',
    cadence: 'Every 2 hours',
    status: 'scheduled',
  },
  {
    name: 'Memory Curator',
    emoji: '🧠',
    role: 'Context keeper',
    kind: 'Subagent',
    focus: 'Keeps always-loaded context lean, moves durable facts into memory, and watches for prompt bloat.',
    cadence: 'Weekly',
    status: 'scheduled',
  },
  {
    name: 'Inbox Sweeper',
    emoji: '🧹',
    role: 'Mail hygiene operator',
    kind: 'Automation',
    focus: 'Handles DRS marketing junk cleanup, triage, spam enforcement, and routine mailbox housekeeping.',
    cadence: 'Scheduled',
    status: 'scheduled',
  },
  {
    name: 'Scout',
    emoji: '🔎',
    role: 'Research subagent',
    kind: 'Subagent',
    focus: 'Handles bounded searches, file discovery, and fact gathering before Guy synthesizes the answer.',
    cadence: 'On demand',
    status: 'standing by',
  },
  {
    name: 'Builder',
    emoji: '🏗️',
    role: 'Implementation subagent',
    kind: 'Subagent',
    focus: 'Takes scoped coding, app, and script work when a task is large enough to benefit from delegation.',
    cadence: 'On demand',
    status: 'standing by',
  },
  {
    name: 'Reviewer',
    emoji: '✅',
    role: 'Verification subagent',
    kind: 'Subagent',
    focus: 'Runs checks, reviews diffs, catches regressions, and reports risks before work is called done.',
    cadence: 'On demand',
    status: 'standing by',
  },
];

function statusLabel(value: TeamMember['status']) {
  if (value === 'active') return 'Active';
  if (value === 'scheduled') return 'Scheduled';
  return 'Standing by';
}

export default async function TeamsPage() {
  const { agentActivities } = await getTaskBoard();
  const activeSessions = agentActivities.filter((activity) => activity.status === 'active');
  const subagentSessions = agentActivities.filter((activity) => activity.kind === 'subagent');
  const scheduledCount = teamMembers.filter((member) => member.status === 'scheduled').length;

  return (
    <main className="reference-dashboard teams-page">
      <section className="reference-header teams-header">
        <div className="reference-header-top">
          <div>
            <div className="reference-title-pill">◉ Teams</div>
            <h1>Agent roster</h1>
            <p>Guy's working bench: standing agents, scheduled operators, and subagents named by the job they do.</p>
          </div>

          <div className="reference-metrics">
            <div className="reference-metric"><strong>{teamMembers.length}</strong><span>Named roles</span></div>
            <div className="reference-metric"><strong>{scheduledCount}</strong><span>Scheduled</span></div>
            <div className="reference-metric"><strong>{subagentSessions.length}</strong><span>Subagent sessions</span></div>
            <div className="reference-metric"><strong>{activeSessions.length}</strong><span>Active now</span></div>
          </div>
        </div>
      </section>

      <section className="teams-grid" aria-label="Agent and subagent roster">
        {teamMembers.map((member) => (
          <article className={`team-card team-card-${member.status.replace(' ', '-')}`} key={member.name}>
            <div className="team-card-top">
              <div className="team-avatar" aria-hidden="true">{member.emoji}</div>
              <div>
                <p className="team-kind">{member.kind}</p>
                <h2>{member.name}</h2>
              </div>
            </div>

            <p className="team-role">{member.role}</p>
            <p className="team-focus">{member.focus}</p>

            <div className="team-card-meta">
              <span>{member.cadence}</span>
              <span className={`team-status team-status-${member.status.replace(' ', '-')}`}>
                {statusLabel(member.status)}
              </span>
            </div>
          </article>
        ))}
      </section>

      <section className="card teams-activity">
        <div className="section-title agent-section-title">
          <div>
            <h2>Recent agent activity</h2>
            <p className="muted small">Current sessions detected from OpenClaw activity.</p>
          </div>
        </div>

        <div className="teams-activity-list">
          {agentActivities.length ? agentActivities.slice(0, 6).map((activity) => (
            <div className="teams-activity-row" key={activity.sessionKey || `${activity.agent}-${activity.updatedAt}`}>
              <div>
                <strong>{activity.displayName || activity.agent}</strong>
                <span>{activity.activeLabel}{activity.channel ? ` · ${activity.channel}` : ''}</span>
              </div>
              <span className={`team-status team-status-${activity.status === 'active' ? 'active' : 'standing-by'}`}>
                {activity.status === 'active' ? 'Active' : 'Idle'}
              </span>
            </div>
          )) : <div className="reference-empty-card compact-empty">No recent agent sessions detected.</div>}
        </div>
      </section>
    </main>
  );
}
