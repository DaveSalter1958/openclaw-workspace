import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import data from '@/data/mission-control.json';
import type {
  MissionControlData,
  ToolIdea,
  ModuleDefinition,
  WorkflowDefinition,
  QueueItem,
  ToolIdeaStatus,
  ModuleType,
  ModuleState,
  WorkflowStatus,
  ToolBlueprint,
  ToolBlueprintStatus,
  CalendarEventItem,
  ProjectCalendarItem,
  ProjectSummary,
  TaskBoardItem,
  AgentActivityItem,
  AgentWorkItem,
  MemoryDashboardData,
  DailyMemoryEntry,
} from '@/lib/types';

const dataPath = path.join(process.cwd(), 'data', 'mission-control.json');
const missionControlData = data as MissionControlData;
const workspaceDir = path.resolve(process.cwd(), '..');
const openclawDir = path.resolve(workspaceDir, '..');
const tasksPath = path.join(workspaceDir, 'second-brain', 'data', 'tasks.json');
const execFileAsync = promisify(execFile);
const calendarFetchTimeoutMs = 3000;

async function readData(): Promise<MissionControlData> {
  try {
    const raw = await fs.readFile(dataPath, 'utf8');
    return JSON.parse(raw) as MissionControlData;
  } catch {
    return missionControlData;
  }
}

async function writeData(value: MissionControlData): Promise<void> {
  await fs.writeFile(dataPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function today() {
  return localDateKey(new Date());
}

export async function getMissionControlData() {
  return readData();
}

export async function getDashboardData() {
  const current = await readData();
  const toolIdeas = current.toolIdeas;
  const modules = current.modules;
  const workflows = current.workflows;
  const toolBlueprints = current.toolBlueprints;
  const buildQueue = current.buildQueue;

  return {
    toolIdeas,
    modules,
    workflows,
    toolBlueprints,
    buildQueue,
    stats: {
      toolIdeas: toolIdeas.length,
      activeBuilds: toolIdeas.filter((idea) => idea.status === 'building').length,
      modulesLive: modules.filter((module) => module.state === 'live').length,
      workflowsActive: workflows.filter((workflow) => workflow.status === 'active').length,
      toolBlueprints: toolBlueprints.length,
    },
    nextIdea: toolIdeas.find((idea) => idea.status !== 'ready') ?? toolIdeas[0],
    readyIdea: toolIdeas.find((idea) => idea.status === 'ready') ?? null,
    plannedModule: modules.find((module) => module.state === 'planned') ?? null,
    nextBlueprint: toolBlueprints[0] ?? null,
  };
}

export async function getToolIdeas(): Promise<ToolIdea[]> {
  return (await readData()).toolIdeas;
}

export async function getModules(): Promise<ModuleDefinition[]> {
  return (await readData()).modules;
}

export async function getWorkflows(): Promise<WorkflowDefinition[]> {
  return (await readData()).workflows;
}

export async function getToolBlueprints(): Promise<ToolBlueprint[]> {
  return (await readData()).toolBlueprints;
}

export async function getBuildQueue(): Promise<QueueItem[]> {
  return (await readData()).buildQueue;
}

export async function addToolIdea(input: {
  name: string;
  owner: string;
  problem: string;
  nextStep: string;
  status?: ToolIdeaStatus;
  tags?: string[];
  users?: string[];
  outputs?: string[];
}): Promise<ToolIdea> {
  const current = await readData();
  const idea: ToolIdea = {
    id: makeId('idea'),
    name: input.name,
    owner: input.owner,
    problem: input.problem,
    nextStep: input.nextStep,
    status: input.status ?? 'discovery',
    tags: input.tags ?? [],
    users: input.users ?? [],
    outputs: input.outputs ?? [],
    updatedAt: today(),
  };

  current.toolIdeas = [idea, ...current.toolIdeas];
  await writeData(current);
  return idea;
}

export async function addModule(input: {
  name: string;
  type: ModuleType;
  description: string;
  state?: ModuleState;
  inputs?: string[];
  outputs?: string[];
}): Promise<ModuleDefinition> {
  const current = await readData();
  const module: ModuleDefinition = {
    id: makeId('module'),
    name: input.name,
    type: input.type,
    description: input.description,
    state: input.state ?? 'planned',
    inputs: input.inputs ?? [],
    outputs: input.outputs ?? [],
  };

  current.modules = [module, ...current.modules];
  await writeData(current);
  return module;
}

export async function addWorkflow(input: {
  name: string;
  goal: string;
  trigger: string;
  owner: string;
  status?: WorkflowStatus;
  steps?: string[];
  moduleIds?: string[];
}): Promise<WorkflowDefinition> {
  const current = await readData();
  const workflow: WorkflowDefinition = {
    id: makeId('workflow'),
    name: input.name,
    goal: input.goal,
    trigger: input.trigger,
    owner: input.owner,
    status: input.status ?? 'draft',
    steps: input.steps ?? [],
    moduleIds: input.moduleIds ?? [],
  };

  current.workflows = [workflow, ...current.workflows];
  await writeData(current);
  return workflow;
}

export async function addToolBlueprint(input: {
  name: string;
  purpose: string;
  owner: string;
  status?: ToolBlueprintStatus;
  workflowIds?: string[];
  moduleIds?: string[];
  expectedInputs?: string[];
  expectedOutputs?: string[];
}): Promise<ToolBlueprint> {
  const current = await readData();
  const blueprint: ToolBlueprint = {
    id: makeId('tool'),
    name: input.name,
    purpose: input.purpose,
    owner: input.owner,
    status: input.status ?? 'concept',
    workflowIds: input.workflowIds ?? [],
    moduleIds: input.moduleIds ?? [],
    expectedInputs: input.expectedInputs ?? [],
    expectedOutputs: input.expectedOutputs ?? [],
  };

  current.toolBlueprints = [blueprint, ...current.toolBlueprints];
  await writeData(current);
  return blueprint;
}

type RawTask = {
  id: string;
  title: string;
  status: 'open' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  dueTime?: string;
  project?: string;
  notes?: string;
  domain?: string;
};

function formatDateLabel(date: Date, allDay = false) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(allDay ? {} : { hour: 'numeric', minute: '2-digit' as const }),
  }).format(date);
}

function combineDue(date: string, time?: string) {
  return new Date(`${date}T${time && time.trim() ? time : '12:00'}:00`);
}

function extractEmailField(notes: string | undefined, label: string) {
  if (!notes) return '';
  const line = notes.split(/\r?\n/).find((item) => item.startsWith(`${label}:`));
  return line ? line.slice(label.length + 1).trim() : '';
}

function extractEmailBody(notes: string | undefined) {
  if (!notes) return '';
  const bodyMarker = 'Email body:';
  const bodyIndex = notes.indexOf(bodyMarker);
  if (bodyIndex >= 0) return notes.slice(bodyIndex + bodyMarker.length).trim();
  const excerptMarker = 'Email excerpt:';
  const excerptIndex = notes.indexOf(excerptMarker);
  return excerptIndex >= 0 ? notes.slice(excerptIndex + excerptMarker.length).trim() : notes.trim();
}

function latestEmailText(value?: string) {
  const body = (value || '').trim();
  if (!body) return '';

  const quoteMarkers = [
    /^From:\s.+$/im,
    /^Sent:\s.+$/im,
    /^To:\s.+$/im,
    /^Subject:\s.+$/im,
    /\bOn\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?[\s\S]{0,220}?wrote:/i,
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{6,}$/m,
  ];
  const markerIndexes = quoteMarkers
    .map((pattern) => body.search(pattern))
    .filter((index) => index > 0);
  const firstMarker = markerIndexes.length ? Math.min(...markerIndexes) : -1;
  let latest = firstMarker > 0 ? body.slice(0, firstMarker) : body;

  const signatureMarkers = [
    /\n\s*(?:thanks|thank you|regards|best|sincerely),?\s*\n+[\s\S]{0,900}$/i,
    /\s+(?:thanks|thank you|regards|best|sincerely),?\s+\*?[A-Z][A-Za-z .'-]+,?\s*(?:P\.?E\.?|S\.?E\.?|President|Principal|Manager|Director)\b[\s\S]{0,900}$/i,
    /\s+(?:thanks|thank you|regards|best|sincerely),?\s+[\s\S]{0,220}@[A-Z0-9.-]+\.[A-Z]{2,}[\s\S]{0,900}$/i,
    /\n\s*get outlook for ios\s*$/i,
  ];
  for (const marker of signatureMarkers) {
    const match = latest.match(marker);
    if (match && match.index && match.index > 0) {
      latest = latest.slice(0, match.index).trim();
      break;
    }
  }

  return latest
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .trim();
}

function emailNeedsDaveAction(item: TaskBoardItem) {
  const subject = cleanEmailSubject(item.emailSubject || item.title);
  const latest = latestEmailText(item.emailBody || item.notes);
  const text = `${subject}\n${latest}`.toLowerCase();
  const latestCompact = latest.toLowerCase().replace(/[^a-z0-9?]+/g, ' ').trim();

  if (!latestCompact) return false;

  const noActionPatterns = [
    /^(excellent|great|ok|okay|sounds good|thank you|thanks|thanks so much|perfect|received|got it|will do|understood|appreciate it)[.! ]*(thank you|thanks)?[.! ]*$/i,
    /\b(we|i)\s+(will|ll)\s+(get|send|provide|prepare|review|respond|reply|circle back|follow up|get back to)\b/i,
    /\b(no action required|for your information|fyi only|just fyi)\b/i,
    /\b(receipt|confirmation|confirmed|scheduled transaction|password reset|statement is available)\b/i,
  ];
  if (noActionPatterns.some((pattern) => pattern.test(latest))) return false;

  const actionPatterns = [
    /\b(action required|requires your action|needs your attention|please respond|response required)\b/i,
    /\b(can|could|would)\s+you\b/i,
    /\bplease\s+(review|approve|confirm|send|provide|sign|complete|advise|respond|reply|call|let me know)\b/i,
    /\b(need|needs|needed)\s+(your|you|dave)\b/i,
    /\b(approve|approval|sign|signature|execute|review and comment|review\/comment|confirm|confirmation needed)\b/i,
    /\b(are you available|availability|can we schedule|schedule a call|call me|give me a call)\b/i,
    /\b(what do you think|your thoughts|your input|your decision|do you want|should we)\b/i,
  ];

  return actionPatterns.some((pattern) => pattern.test(text));
}

function cleanEmailSubject(value: string) {
  return value.replace(/^(re|fw|fwd):\s*/i, '').trim();
}

async function readRawTasks(): Promise<RawTask[]> {
  try {
    const raw = await fs.readFile(tasksPath, 'utf8');
    return JSON.parse(raw) as RawTask[];
  } catch {
    return [];
  }
}

function calendarErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: string | number; killed?: boolean; signal?: string; stderr?: string; message?: string };
    if (candidate.killed || candidate.signal === 'SIGKILL') {
      return `Google Calendar did not respond within ${calendarFetchTimeoutMs / 1000} seconds.`;
    }
    const stderr = candidate.stderr?.trim();
    if (stderr) return stderr.split(/\r?\n/)[0];
    if (candidate.message) return candidate.message.split(/\r?\n/)[0];
  }
  return 'Google Calendar is temporarily unavailable.';
}

export async function getCalendarView(days = 14): Promise<{ googleEvents: CalendarEventItem[]; projectItems: ProjectCalendarItem[]; googleError?: string }> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  let googleEvents: CalendarEventItem[] = [];
  let googleError: string | undefined;
  try {
    const { stdout } = await execFileAsync('/usr/local/bin/gog', [
      'calendar',
      'events',
      'drs@drs-engineering.net',
      '-a',
      'drs@drs-engineering.net',
      '--from',
      now.toISOString(),
      '--to',
      end.toISOString(),
      '--json',
    ], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: calendarFetchTimeoutMs,
      killSignal: 'SIGKILL',
      env: { ...process.env, GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD ?? '' },
    });

    const parsed = JSON.parse(stdout) as { events?: any[] };
    googleEvents = (parsed.events || []).map((event) => {
      const allDay = Boolean(event.start?.date && !event.start?.dateTime);
      const startRaw = event.start?.dateTime || `${event.start?.date}T00:00:00`;
      const endRaw = event.end?.dateTime || (event.end?.date ? `${event.end?.date}T00:00:00` : undefined);
      const startDate = new Date(startRaw);
      const endDate = endRaw ? new Date(endRaw) : undefined;
      return {
        id: event.id,
        summary: event.summary || 'Untitled event',
        startLabel: formatDateLabel(startDate, allDay),
        startSort: startDate.toISOString(),
        endLabel: endDate ? formatDateLabel(endDate, allDay) : undefined,
        location: event.location || '',
        source: 'google',
        link: event.htmlLink || '',
        allDay,
      } satisfies CalendarEventItem;
    });
  } catch (error) {
    googleEvents = [];
    googleError = calendarErrorMessage(error);
  }

  let projectItems: ProjectCalendarItem[] = [];
  try {
    const tasks = await readRawTasks();
    projectItems = tasks
      .filter((task) => task.status === 'open' && task.dueDate)
      .map((task) => {
        const due = combineDue(task.dueDate!, task.dueTime);
        return {
          id: task.id,
          title: task.title,
          dueLabel: formatDateLabel(due, !task.dueTime),
          dueSort: due.toISOString(),
          project: task.project?.trim() || 'General',
          source: 'task',
          priority: task.priority || 'medium',
          notes: task.notes || '',
        } satisfies ProjectCalendarItem;
      })
      .filter((task) => new Date(task.dueSort) >= now && new Date(task.dueSort) <= end)
      .sort((a, b) => a.dueSort.localeCompare(b.dueSort));
  } catch {
    projectItems = [];
  }

  googleEvents.sort((a, b) => a.startSort.localeCompare(b.startSort));
  return { googleEvents, projectItems, googleError };
}

function sessionStatus(updatedAt?: number): 'active' | 'idle' {
  if (!updatedAt) return 'idle';
  const ageMs = Date.now() - updatedAt;
  return ageMs <= 15 * 60 * 1000 ? 'active' : 'idle';
}

function relativeActivityLabel(updatedAt?: number): string {
  if (!updatedAt) return 'unknown';
  const diffMs = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes <= 0) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function extractWorkItems(messages: Array<{ role?: string; content?: string }> | undefined): AgentWorkItem[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const items: AgentWorkItem[] = [];
  for (const message of messages) {
    const text = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!text) continue;
    const clean = text.replace(/\s+/g, ' ').trim();
    items.push({
      title: clean.slice(0, 120),
      detail: clean.length > 120 ? clean.slice(120, 260) : undefined,
    });
    if (items.length >= 3) break;
  }
  return items;
}

async function getAgentActivities(agentTasks: TaskBoardItem[]): Promise<AgentActivityItem[]> {
  const sessionsDir = path.join(openclawDir, 'agents', 'main', 'sessions');
  try {
    const files = (await fs.readdir(sessionsDir))
      .filter((name) => name.endsWith('.jsonl') && !name.includes('.checkpoint.') && !name.includes('.reset.'))
      .map((name) => path.join(sessionsDir, name));

    const records = await Promise.all(files.map(async (filePath) => {
      const stat = await fs.stat(filePath);
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.trim().split(/\r?\n/).filter(Boolean);
      const recent = lines.slice(-30);
      const workItems: AgentWorkItem[] = [];
      let agent = 'main';
      let channel = '';
      for (const line of recent.reverse()) {
        try {
          const entry = JSON.parse(line);
          const role = entry?.message?.role;
          const content = Array.isArray(entry?.message?.content) ? entry.message.content : [];
          const textBlock = content.find((item: any) => item?.type === 'text' && typeof item.text === 'string');
          const text = typeof textBlock?.text === 'string' ? textBlock.text.replace(/\s+/g, ' ').trim() : '';
          if (!channel && entry?.message?.metadata?.channel) channel = String(entry.message.metadata.channel);
          if (!text) continue;
          if (role === 'assistant' || role === 'user') {
            workItems.unshift({
              title: text.slice(0, 120),
              detail: text.length > 120 ? text.slice(120, 260) : undefined,
            });
          }
          if (text.toLowerCase().includes('subagent')) agent = 'subagent';
          if (workItems.length >= 3) break;
        } catch {}
      }
      return {
        agent,
        sessionCount: 1,
        activeLabel: relativeActivityLabel(stat.mtimeMs),
        status: sessionStatus(stat.mtimeMs),
        store: filePath,
        tasks: agent === 'main' ? agentTasks : [],
        kind: agent === 'subagent' ? 'subagent' : 'session',
        sessionKey: path.basename(filePath, '.jsonl'),
        displayName: agent === 'main' ? 'Main session' : 'Subagent session',
        model: 'gpt-5.4',
        channel,
        updatedAt: new Date(stat.mtimeMs).toISOString(),
        transcriptPath: filePath,
        workItems: workItems.reverse(),
      } satisfies AgentActivityItem;
    }));

    if (records.length) {
      return records.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      }).slice(0, 8);
    }
  } catch {}

  try {
    const { stdout } = await execFileAsync('openclaw', ['status', '--all'], { maxBuffer: 10 * 1024 * 1024 });
    const lines = stdout.split(/\r?\n/);
    const start = lines.findIndex((line) => line.includes('│ Agent'));
    if (start === -1) {
      return [];
    }

    const activities: AgentActivityItem[] = [];
    for (let i = start + 2; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line || !line.includes('│')) continue;
      if (line.includes('└') || line.includes('Diagnosis')) break;
      const cells = line.split('│').map((part) => part.trim()).filter(Boolean);
      if (cells.length < 5) continue;
      const [agent, , sessions, activeLabel, store] = cells;
      activities.push({
        agent,
        sessionCount: Number.parseInt(sessions, 10) || 0,
        activeLabel,
        status: /just now|\d+\s*(sec|min|minute|minutes|hour|hours)/i.test(activeLabel) ? 'active' : 'idle',
        store,
        tasks: agent === 'main' ? agentTasks : [],
      });
    }
    return activities;
  } catch {
    return [];
  }
}

export async function getTaskBoard(): Promise<{
  dueToday: TaskBoardItem[];
  dueThisWeek: TaskBoardItem[];
  dueLater: TaskBoardItem[];
  emailTasks: TaskBoardItem[];
  agentTasks: TaskBoardItem[];
  agentActivities: AgentActivityItem[];
}> {
  const tasks = await readRawTasks();
  const now = new Date();
  const todayKey = localDateKey(now);
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);
  weekEnd.setDate(now.getDate() + 7);
  const weekEndKey = localDateKey(weekEnd);

  const dated = tasks
    .filter((task) => task.status === 'open' && task.dueDate)
    .map((task) => {
      const due = combineDue(task.dueDate!, task.dueTime);
      return {
        id: task.id,
        title: task.title,
        dueLabel: formatDateLabel(due, !task.dueTime),
        dueSort: due.toISOString(),
        dueDateKey: task.dueDate,
        priority: task.priority || 'medium',
        project: task.project?.trim() || 'General',
        notes: task.notes || '',
        domain: task.domain || '',
        emailDate: extractEmailField(task.notes, 'Date'),
        emailFrom: extractEmailField(task.notes, 'From'),
        emailSubject: extractEmailField(task.notes, 'Subject') || task.title,
        emailBody: extractEmailBody(task.notes),
      } satisfies TaskBoardItem;
    })
    .sort((a, b) => (a.dueSort || '').localeCompare(b.dueSort || ''));

  const agentTask = (item: TaskBoardItem) => item.project === 'Guy'
    || /^hey guy/i.test(item.title)
    || /^merge vehicle maintenance notes into one reference doc$/i.test(item.title);
  const emailTask = (item: TaskBoardItem) => item.domain === 'email' || item.project.startsWith('Email');
  const agentTasks = dated.filter((item) => !emailTask(item) && agentTask(item));
  // Email tasks have already been conservatively filtered by the daily scanner before
  // they are written to tasks.json. Do not re-filter here, or valid created tasks get
  // hidden from Dave's Tasks from Email column.
  const emailTasks = dated.filter(emailTask).sort((a, b) => (b.emailDate || b.dueSort || '').localeCompare(a.emailDate || a.dueSort || ''));
  const personalTasks = dated.filter((item) => !agentTask(item) && !emailTask(item));

  const dueToday = personalTasks.filter((item) => Boolean(item.dueDateKey && item.dueDateKey <= todayKey));
  const dueThisWeek = personalTasks.filter((item) => Boolean(item.dueDateKey && item.dueDateKey > todayKey && item.dueDateKey <= weekEndKey));
  const dueLater = personalTasks.filter((item) => Boolean(item.dueDateKey && item.dueDateKey > weekEndKey));

  const agentActivities = await getAgentActivities(agentTasks);

  return { dueToday, dueThisWeek, dueLater, emailTasks, agentTasks, agentActivities };
}

export async function getMemoryDashboard(): Promise<MemoryDashboardData> {
  const memoryDir = path.join(workspaceDir, 'memory');
  try {
    const files = (await fs.readdir(memoryDir))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .sort()
      .reverse();

    const entries: DailyMemoryEntry[] = [];
    for (const file of files) {
      const fullPath = path.join(memoryDir, file);
      const raw = await fs.readFile(fullPath, 'utf8');
      const lines = raw.split(/\r?\n/);
      const meaningful = lines.map((line) => line.trim()).filter(Boolean);
      const title = meaningful.find((line) => !line.startsWith('#')) || 'Daily log';
      const summary = meaningful.find((line) => !line.startsWith('#') && line !== title) || 'No summary captured yet.';
      const highlights = meaningful
        .filter((line) => !line.startsWith('#'))
        .slice(0, 4);
      entries.push({
        date: file.replace('.md', ''),
        title,
        summary,
        file: `memory/${file}`,
        lineCount: lines.length,
        highlights,
      });
    }

    return {
      entries,
      latest: entries[0] || null,
    };
  } catch {
    return { entries: [], latest: null };
  }
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const [current, tasks] = await Promise.all([readData(), readRawTasks()]);
  const projectMap = new Map<string, ProjectSummary>();

  const ensureProject = (name: string, seed?: Partial<ProjectSummary>) => {
    const key = name.trim();
    if (!projectMap.has(key)) {
      projectMap.set(key, {
        id: key.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: key,
        status: 'planned',
        priority: 'medium',
        owner: 'Dave',
        nextStep: 'Define the next move.',
        taskCount: 0,
        blocker: '',
        notes: '',
        linkedTasks: [],
        ...seed,
      });
    }
    return projectMap.get(key)!;
  };

  current.toolIdeas.forEach((idea) => {
    const project = ensureProject(idea.name, {
      status: idea.status === 'ready' ? 'done' : idea.status === 'building' ? 'active' : 'planned',
      priority: idea.status === 'building' ? 'high' : 'medium',
      owner: idea.owner,
      nextStep: idea.nextStep,
      notes: idea.problem,
    });
    if (idea.status === 'building') project.blocker = 'Needs sustained build attention.';
  });

  current.toolBlueprints.forEach((tool) => {
    const project = ensureProject(tool.name, {
      status: tool.status === 'ready' ? 'done' : tool.status === 'designing' ? 'active' : 'planned',
      priority: tool.status === 'designing' ? 'high' : 'medium',
      owner: tool.owner,
      nextStep: tool.purpose,
    });
    if (!project.notes) project.notes = tool.purpose;
  });

  tasks.forEach((task) => {
    const name = task.project?.trim() || task.title;
    const project = ensureProject(name, {
      status: task.status === 'done' ? 'done' : 'active',
      priority: task.priority || 'medium',
      owner: 'Dave',
      nextStep: task.notes?.trim() || task.title,
    });
    if (task.status === 'open') {
      project.status = project.status === 'done' ? 'active' : project.status;
      project.priority = task.priority === 'high' || project.priority === 'high' ? 'high' : task.priority === 'medium' || project.priority === 'medium' ? 'medium' : 'low';
      project.taskCount += 1;
      const due = task.dueDate ? combineDue(task.dueDate, task.dueTime) : null;
      if (due) {
        const dueSort = due.toISOString();
        if (!project.dueSort || dueSort < project.dueSort) {
          project.dueSort = dueSort;
          project.dueLabel = formatDateLabel(due, !task.dueTime);
        }
      }
      project.linkedTasks.push({
        id: task.id,
        title: task.title,
        dueLabel: task.dueDate ? formatDateLabel(combineDue(task.dueDate, task.dueTime), !task.dueTime) : undefined,
        priority: task.priority || 'medium',
        notes: task.notes || '',
      });
    }
  });

  const projects = Array.from(projectMap.values()).sort((a, b) => {
    const priorityRank = { high: 0, medium: 1, low: 2 };
    return priorityRank[a.priority] - priorityRank[b.priority]
      || (a.dueSort || '9999').localeCompare(b.dueSort || '9999')
      || b.taskCount - a.taskCount
      || a.name.localeCompare(b.name);
  });

  return projects;
}
