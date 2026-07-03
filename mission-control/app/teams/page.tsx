export const dynamic = 'force-dynamic';

type TeamMember = {
  name: string;
  emoji: string;
  role: string;
  kind: 'Agent' | 'Subagent' | 'Automation';
  focus: string;
  cadence: string;
  status: 'standing by' | 'scheduled' | 'active';
  lastRun: string;
  lastResult: 'Active' | 'Success' | 'Failure' | 'Not recorded';
  nextRun: string;
  runNote: string;
};

const teamMembers: TeamMember[] = [
  {
    name: 'Guy',
    emoji: '🧢',
    role: 'COO and technical partner',
    kind: 'Agent',
    focus: 'Orchestrates work, delegates non-trivial tasks, watches quality, and gives Dave the decision-ready version.',
    cadence: 'Always on',
    status: 'active',
    lastRun: 'Live now',
    lastResult: 'Active',
    nextRun: 'On demand',
    runNote: 'Main agent for Dave-facing work, synthesis, delegation, and final quality checks.',
  },
  {
    name: 'PlanHubGuy',
    emoji: '💌',
    role: 'Proposal inbox operator',
    kind: 'Automation',
    focus: 'Reviews PlanHub replies, drafts responses, watches queues, and keeps DRS proposal work moving.',
    cadence: 'Daily',
    status: 'scheduled',
    lastRun: 'Weekday schedule',
    lastResult: 'Not recorded',
    nextRun: 'Next weekday 1:00 PM',
    runNote: 'Runs through the direct gateway command runner; live sends stay capped and reviewed.',
  },
  {
    name: 'Security Sentinel',
    emoji: '🛡️',
    role: 'Host exposure auditor',
    kind: 'Subagent',
    focus: 'Checks open ports, gateway auth, localhost binding, SSH posture, firewall rules, and exposed services.',
    cadence: '7:00 AM',
    status: 'scheduled',
    lastRun: 'Not tracked yet',
    lastResult: 'Not recorded',
    nextRun: 'Daily 7:00 AM',
    runNote: 'Should report exposure, auth, firewall, SSH, and service binding risks.',
  },
  {
    name: 'Patchwright',
    emoji: '🪛',
    role: 'Security fixer',
    kind: 'Subagent',
    focus: 'Reads the security audit and fixes critical or high severity issues when the remediation is reversible.',
    cadence: '7:30 AM',
    status: 'scheduled',
    lastRun: 'Not tracked yet',
    lastResult: 'Not recorded',
    nextRun: 'Daily 7:30 AM',
    runNote: 'Should act only on reversible critical or high severity security fixes.',
  },
  {
    name: 'Keymaster',
    emoji: '🗝️',
    role: 'API key auditor',
    kind: 'Subagent',
    focus: 'Validates configured API keys, checks usage and spend, and flags broken keys or unusual cost spikes.',
    cadence: '8:00 AM',
    status: 'scheduled',
    lastRun: 'Not tracked yet',
    lastResult: 'Not recorded',
    nextRun: 'Daily 8:00 AM',
    runNote: 'Should flag broken credentials, unusual spend, and suspicious usage changes.',
  },
  {
    name: 'Cron Marshal',
    emoji: '⏰',
    role: 'Schedule supervisor',
    kind: 'Subagent',
    focus: 'Monitors registered cron jobs, catches failures or silent removals, and restarts safe jobs when needed.',
    cadence: '9:00 AM',
    status: 'scheduled',
    lastRun: 'Not tracked yet',
    lastResult: 'Not recorded',
    nextRun: 'Daily 9:00 AM',
    runNote: 'Should watch for missing jobs, failed runs, and quiet schedule drift.',
  },
  {
    name: 'Archive Clerk',
    emoji: '💾',
    role: 'Workspace backup runner',
    kind: 'Automation',
    focus: 'Commits workspace changes with timestamped messages and pushes the private GitHub backup.',
    cadence: 'Every 2 hours',
    status: 'scheduled',
    lastRun: 'Not tracked here',
    lastResult: 'Not recorded',
    nextRun: 'Every 2 hours',
    runNote: 'Should preserve workspace changes without touching unrelated private material.',
  },
  {
    name: 'Memory Curator',
    emoji: '🧠',
    role: 'Context keeper',
    kind: 'Subagent',
    focus: 'Keeps always-loaded context lean, moves durable facts into memory, and watches for prompt bloat.',
    cadence: 'Weekly',
    status: 'scheduled',
    lastRun: 'Not tracked yet',
    lastResult: 'Not recorded',
    nextRun: 'Weekly',
    runNote: 'Should move durable details into memory files and keep startup context tidy.',
  },
  {
    name: 'Inbox Sweeper',
    emoji: '🧽',
    role: 'Mail hygiene operator',
    kind: 'Automation',
    focus: 'Handles DRS marketing junk cleanup, triage, spam enforcement, and routine mailbox housekeeping.',
    cadence: 'Scheduled',
    status: 'scheduled',
    lastRun: 'Not tracked here',
    lastResult: 'Not recorded',
    nextRun: 'Scheduled',
    runNote: 'Must protect Dave@DRS-Engineering.net and only apply DRS cleanup rules to the right mailbox.',
  },
  {
    name: 'Scout',
    emoji: '🕵️',
    role: 'Research subagent',
    kind: 'Subagent',
    focus: 'Handles bounded searches, file discovery, and fact gathering before Guy synthesizes the answer.',
    cadence: 'On demand',
    status: 'standing by',
    lastRun: 'On demand',
    lastResult: 'Not recorded',
    nextRun: 'When delegated',
    runNote: 'Best for scoped research, local search, and context gathering.',
  },
  {
    name: 'Builder',
    emoji: '🧱',
    role: 'Implementation subagent',
    kind: 'Subagent',
    focus: 'Takes scoped coding, app, and script work when a task is large enough to benefit from delegation.',
    cadence: 'On demand',
    status: 'standing by',
    lastRun: 'On demand',
    lastResult: 'Not recorded',
    nextRun: 'When delegated',
    runNote: 'Best for implementation chunks after Guy defines the target and constraints.',
  },
  {
    name: 'Reviewer',
    emoji: '🔍',
    role: 'Verification subagent',
    kind: 'Subagent',
    focus: 'Runs checks, reviews diffs, catches regressions, and reports risks before work is called done.',
    cadence: 'On demand',
    status: 'standing by',
    lastRun: 'On demand',
    lastResult: 'Not recorded',
    nextRun: 'When delegated',
    runNote: 'Best for focused verification, diff review, and test risk checks.',
  },
];

function statusLabel(value: TeamMember['status']) {
  if (value === 'active') return 'Active';
  if (value === 'scheduled') return 'Scheduled';
  return 'Standing by';
}

function resultClass(value: TeamMember['lastResult']) {
  return value.toLowerCase().replace(' ', '-');
}

function TeamCard({ member, variant = 'standard' }: { member: TeamMember; variant?: 'standard' | 'lead' | 'automation' }) {
  return (
    <article
      className={`team-card team-card-${member.status.replace(' ', '-')} team-card-${variant}`}
      tabIndex={0}
      title={`${member.name}: ${member.role}`}
      aria-label={`${member.name}, ${member.kind}, ${member.role}. ${member.focus}`}
    >
      <div className="team-card-top">
        <div className="team-avatar" aria-hidden="true">{member.emoji}</div>
        <div className="team-card-identity">
          <p className="team-kind">{member.kind}</p>
          <h2>{member.name}</h2>
        </div>
      </div>

      <div className="team-card-details">
        <p className="team-role">{member.role}</p>
        <p className="team-focus">{member.focus}</p>

        <dl className="team-run-data">
          <div>
            <dt>Last run</dt>
            <dd>{member.lastRun}</dd>
          </div>
          <div>
            <dt>Result</dt>
            <dd><span className={`team-result team-result-${resultClass(member.lastResult)}`}>{member.lastResult}</span></dd>
          </div>
          <div>
            <dt>Next</dt>
            <dd>{member.nextRun}</dd>
          </div>
        </dl>

        <p className="team-run-note">{member.runNote}</p>

        <div className="team-card-meta">
          <span>{member.cadence}</span>
          <span className={`team-status team-status-${member.status.replace(' ', '-')}`}>
            {statusLabel(member.status)}
          </span>
        </div>
      </div>
    </article>
  );
}

export default async function TeamsPage() {
  const mainAgent = teamMembers.find((member) => member.name === 'Guy') ?? teamMembers[0];
  const subagents = teamMembers.filter((member) => member.kind === 'Subagent');
  const automations = teamMembers.filter((member) => member.kind === 'Automation');
  const scheduledCount = teamMembers.filter((member) => member.status === 'scheduled').length;

  return (
    <main className="reference-dashboard teams-page">
      <section className="reference-header teams-header">
        <div className="reference-header-top">
          <div>
            <div className="reference-title-pill">◉ Agents</div>
            <h1>Agent roster</h1>
            <p>Guy's working bench: standing agents, scheduled operators, and subagents named by the job they do.</p>
          </div>

          <div className="reference-metrics">
            <div className="reference-metric"><strong>{teamMembers.length}</strong><span>Named roles</span></div>
            <div className="reference-metric"><strong>{scheduledCount}</strong><span>Scheduled</span></div>
            <div className="reference-metric"><strong>{subagents.length}</strong><span>Subagents</span></div>
            <div className="reference-metric"><strong>{automations.length}</strong><span>Automations</span></div>
          </div>
        </div>
      </section>

      <section className="agents-command-layout" aria-label="Agent command layout">
        <div className="agents-main-column">
          <section className="agents-lead-panel" aria-label="Main agent">
            <div className="agent-panel-heading">
              <span>Main agent</span>
              <strong>Lead</strong>
            </div>
            <TeamCard member={mainAgent} variant="lead" />
          </section>

          <section className="agents-subagent-panel" aria-label="Subagents">
            <div className="agent-panel-heading">
              <span>Subagents</span>
              <strong>{subagents.length}</strong>
            </div>
            <div className="teams-grid subagents-grid">
              {subagents.map((member) => (
                <TeamCard member={member} key={member.name} />
              ))}
            </div>
          </section>
        </div>

        <aside className="agents-automation-window" aria-label="Automations">
          <div className="agent-panel-heading">
            <span>Automations</span>
            <strong>{automations.length}</strong>
          </div>
          <div className="automation-stack">
            {automations.map((member) => (
              <TeamCard member={member} variant="automation" key={member.name} />
            ))}
          </div>
        </aside>
      </section>

    </main>
  );
}
