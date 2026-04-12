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
  MemoryDashboardData,
  DailyMemoryEntry,
} from '@/lib/types';

const dataPath = path.join(process.cwd(), 'data', 'mission-control.json');
const missionControlData = data as MissionControlData;
const workspaceDir = path.resolve(process.cwd(), '..');
const tasksPath = path.join(workspaceDir, 'second-brain', 'data', 'tasks.json');
const execFileAsync = promisify(execFile);

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

async function readRawTasks(): Promise<RawTask[]> {
  try {
    const raw = await fs.readFile(tasksPath, 'utf8');
    return JSON.parse(raw) as RawTask[];
  } catch {
    return [];
  }
}

export async function getCalendarView(days = 14): Promise<{ googleEvents: CalendarEventItem[]; projectItems: ProjectCalendarItem[] }> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  let googleEvents: CalendarEventItem[] = [];
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
    ], { maxBuffer: 10 * 1024 * 1024 });

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
  } catch {
    googleEvents = [];
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
  return { googleEvents, projectItems };
}

export async function getTaskBoard(): Promise<{
  dueToday: TaskBoardItem[];
  dueThisWeek: TaskBoardItem[];
  dueLater: TaskBoardItem[];
  agentTasks: TaskBoardItem[];
}> {
  const tasks = await readRawTasks();
  const now = new Date();
  const todayKey = localDateKey(now);
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);
  weekEnd.setDate(now.getDate() + 7);

  const dated = tasks
    .filter((task) => task.status === 'open' && task.dueDate)
    .map((task) => {
      const due = combineDue(task.dueDate!, task.dueTime);
      return {
        id: task.id,
        title: task.title,
        dueLabel: formatDateLabel(due, !task.dueTime),
        dueSort: due.toISOString(),
        priority: task.priority || 'medium',
        project: task.project?.trim() || 'General',
        notes: task.notes || '',
      } satisfies TaskBoardItem;
    })
    .sort((a, b) => (a.dueSort || '').localeCompare(b.dueSort || ''));

  const agentTask = (item: TaskBoardItem) => item.project === 'Guy'
    || /^hey guy/i.test(item.title)
    || /^merge vehicle maintenance notes into one reference doc$/i.test(item.title);
  const agentTasks = dated.filter(agentTask);
  const personalTasks = dated.filter((item) => !agentTask(item));

  const dueToday = personalTasks.filter((item) => item.dueSort?.slice(0, 10) === todayKey);
  const dueThisWeek = personalTasks.filter((item) => {
    if (!item.dueSort) return false;
    const due = new Date(item.dueSort);
    return item.dueSort.slice(0, 10) !== todayKey && due <= weekEnd;
  });
  const dueLater = personalTasks.filter((item) => {
    if (!item.dueSort) return false;
    return new Date(item.dueSort) > weekEnd;
  });

  return { dueToday, dueThisWeek, dueLater, agentTasks };
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
