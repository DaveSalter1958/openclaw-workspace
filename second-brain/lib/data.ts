import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { CalendarEventItem, DayLoadItem, DocumentItem, EmailItem, MemoryItem, TaskItem, TaskPressureItem, TaskPriority, TaskScope } from '@/lib/types';

const execFileAsync = promisify(execFile);
const appDir = process.cwd();
const dataDir = path.join(appDir, 'data');
const workspaceDir = path.resolve(appDir, '..');
const workspaceMemoryDir = path.join(workspaceDir, 'memory');
const dropboxRoot = 'Dropbox:Private - Personal';
const calendarAccount = 'drs@drs-engineering.net';
const gmailAccount = 'drs@drs-engineering.net';

async function readJsonFile<T>(fileName: string): Promise<T> {
  const filePath = path.join(dataDir, fileName);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile<T>(fileName: string, value: T): Promise<void> {
  const filePath = path.join(dataDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function summarizeText(text: string, maxLength = 220) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'No summary available.';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

function deriveTags(fileName: string, body: string, kind: 'long-term' | 'daily') {
  const tags = new Set<string>();
  if (kind === 'long-term') tags.add('long-term');
  if (kind === 'daily') tags.add('daily');
  const lowered = `${fileName} ${body}`.toLowerCase();
  if (lowered.includes('hiking')) tags.add('hiking');
  if (lowered.includes('dropbox')) tags.add('dropbox');
  if (lowered.includes('calendar')) tags.add('calendar');
  if (lowered.includes('gmail') || lowered.includes('email')) tags.add('email');
  if (lowered.includes('painting')) tags.add('painting');
  if (lowered.includes('offroading') || lowered.includes('overlanding')) tags.add('overlanding');
  return Array.from(tags);
}

function deriveEnergy(body: string): MemoryItem['energy'] {
  const lowered = body.toLowerCase();
  if (lowered.includes('favorite') || lowered.includes('hiking') || lowered.includes('painting')) return 'restorative';
  if (lowered.includes('trust') || lowered.includes('identity') || lowered.includes('soul')) return 'reflective';
  return 'practical';
}

async function fileExists(filePath: string) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function getWorkspaceMemories(): Promise<MemoryItem[]> {
  const memoryFiles: string[] = [];
  const longTermPath = path.join(workspaceDir, 'MEMORY.md');
  if (await fileExists(longTermPath)) memoryFiles.push(longTermPath);
  if (await fileExists(workspaceMemoryDir)) {
    const dailyFiles = (await fs.readdir(workspaceMemoryDir))
      .filter((entry) => entry.endsWith('.md'))
      .sort()
      .reverse()
      .map((entry) => path.join(workspaceMemoryDir, entry));
    memoryFiles.push(...dailyFiles);
  }

  const items: MemoryItem[] = [];
  for (const filePath of memoryFiles) {
    const raw = await fs.readFile(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const kind: MemoryItem['kind'] = fileName === 'MEMORY.md' ? 'long-term' : 'daily';
    const date = kind === 'long-term' ? 'Curated long-term memory' : fileName.replace(/\.md$/, '');
    const bulletLines = raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('- ')).slice(0, 6).map((line) => line.replace(/^-\s+/, ''));
    const summarySource = bulletLines.length > 0 ? bulletLines.join(' ') : raw;
    items.push({
      id: `memory-${fileName}`,
      title: kind === 'long-term' ? 'Long-term memory' : `Daily memory · ${date}`,
      date,
      summary: summarizeText(summarySource, 260),
      tags: deriveTags(fileName, raw, kind),
      energy: deriveEnergy(raw),
      source: path.relative(workspaceDir, filePath),
      kind,
    });
  }
  return items;
}

type RcloneItem = { Path: string; Name?: string; Size?: number; MimeType?: string; ModTime?: string; IsDir?: boolean };
async function listDropboxJson(target: string) {
  try {
    const { stdout } = await execFileAsync('rclone', ['lsjson', target]);
    return JSON.parse(stdout) as RcloneItem[];
  } catch { return []; }
}

type GogCalendarEvent = {
  id?: string;
  summary?: string;
  status?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  organizer?: { email?: string };
};

const nonInteractiveGogEnv = { ...process.env, GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD ?? '' };

function formatCalendarInstant(value: string | undefined, fallback = 'Unknown') {
  if (!value) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

async function getCalendarEvents(fromIso: string, toIso: string): Promise<CalendarEventItem[]> {
  try {
    const { stdout } = await execFileAsync('gog', ['calendar', 'events', calendarAccount, '-a', calendarAccount, '--from', fromIso, '--to', toIso, '--json'], { env: nonInteractiveGogEnv });
    const parsed = JSON.parse(stdout) as { events?: GogCalendarEvent[] };
    return (parsed.events ?? []).map((event) => {
      const startRaw = event.start?.dateTime ?? event.start?.date;
      const endRaw = event.end?.dateTime ?? event.end?.date;
      const allDay = Boolean(event.start?.date && !event.start?.dateTime);
      return {
        id: event.id ?? `${event.summary ?? 'event'}-${startRaw ?? 'unknown'}`,
        title: event.summary ?? 'Untitled event',
        start: formatCalendarInstant(startRaw),
        end: formatCalendarInstant(endRaw),
        allDay,
        source: event.organizer?.email ?? 'Calendar',
        location: event.location,
        status: event.status,
        startDateRaw: startRaw ? (startRaw.includes('T') ? startRaw.slice(0, 10) : startRaw) : undefined,
        startDateTimeRaw: startRaw,
      };
    });
  } catch { return []; }
}

async function getUpcomingCalendarEvents(): Promise<CalendarEventItem[]> {
  const now = new Date();
  const weekAhead = new Date(now);
  weekAhead.setDate(weekAhead.getDate() + 7);
  return (await getCalendarEvents(now.toISOString(), weekAhead.toISOString())).slice(0, 8);
}

async function getTodaysCalendarEvents(): Promise<CalendarEventItem[]> {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return getCalendarEvents(start.toISOString(), end.toISOString());
}

type GmailThread = { id: string; date: string; from: string; subject: string; labels: string[]; messageCount?: number };
type GmailMessageGet = { id?: string; subject?: string; from?: string; snippet?: string; plainText?: string; text?: string; labels?: string[] };

async function getThreadSnippet(id: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gog', ['gmail', 'get', id, '-a', gmailAccount, '--json'], { env: nonInteractiveGogEnv });
    const parsed = JSON.parse(stdout) as GmailMessageGet;
    const body = parsed.snippet || parsed.plainText || parsed.text || '';
    return summarizeText(body, 180);
  } catch {
    return 'No snippet available.';
  }
}

function scoreNeedsReply(item: EmailItem) {
  const text = `${item.from} ${item.subject} ${item.snippet ?? ''}`.toLowerCase();
  const from = item.from.toLowerCase();
  let score = 0;

  if (/newsletter|newsletters|amazon|rough country|phonefusion|voicemail|podcasts|cnn|icc|auto-confirm|labusinessjournal/.test(text)) score -= 6;
  if (/category_promotions|category_updates/.test(item.labels.join(' ').toLowerCase())) score -= 2;
  if (from.includes('drs@drs-engineering.net')) score -= 8;

  if (/reply|respond|let me know|question|can you|could you|please|review|approval|confirm|meeting|schedule|invitation/.test(text)) score += 3;
  if (/alex|eric|brian|permit|correction|invoice|estimate|woodward/.test(text)) score += 2;
  if (/category_personal|important/.test(item.labels.join(' ').toLowerCase())) score += 1;
  if (item.messageCount && item.messageCount > 1) score += 1;

  return score;
}

async function getInboxThreads(): Promise<EmailItem[]> {
  try {
    const { stdout } = await execFileAsync('gog', ['gmail', 'search', 'in:inbox newer_than:7d', '--max', '12', '-a', gmailAccount, '--json'], { env: nonInteractiveGogEnv });
    const parsed = JSON.parse(stdout) as { threads?: GmailThread[] };
    const threads = parsed.threads ?? [];
    const items = await Promise.all(threads.map(async (thread) => {
      const base: EmailItem = {
        id: thread.id,
        date: thread.date,
        from: thread.from,
        subject: thread.subject,
        labels: thread.labels ?? [],
        messageCount: thread.messageCount,
        snippet: await getThreadSnippet(thread.id),
      };
      return { ...base, needsReplyScore: scoreNeedsReply(base) };
    }));
    return items;
  } catch { return []; }
}

async function getWorkspaceDocuments(): Promise<DocumentItem[]> {
  const names = ['AGENTS.md', 'SOUL.md', 'USER.md', 'HOW_TO_TEACH_WILLY.md', 'MEMORY.md', 'TOOLS.md'];
  const docs: DocumentItem[] = [];
  for (const name of names) {
    const filePath = path.join(workspaceDir, name);
    if (!(await fileExists(filePath))) continue;
    const [raw, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
    docs.push({
      id: `workspace-${name}`,
      title: name,
      type: 'Workspace note',
      updatedAt: stat.mtime.toISOString().slice(0, 10),
      status: name === 'MEMORY.md' ? 'active' : 'needs review',
      summary: summarizeText(raw, 220),
      source: 'Workspace',
      path: path.relative(workspaceDir, filePath),
      location: 'workspace',
    });
  }
  return docs;
}

async function getDropboxDocuments(): Promise<DocumentItem[]> {
  const [folders, files] = await Promise.all([listDropboxJson(dropboxRoot), listDropboxJson(dropboxRoot)]);
  const folderDocs = folders.filter((item) => item.IsDir).slice(0, 18).map<DocumentItem>((item) => ({
    id: `dropbox-dir-${item.Path}`,
    title: item.Name ?? item.Path,
    type: 'Dropbox folder',
    updatedAt: item.ModTime ? item.ModTime.slice(0, 10) : 'Unknown',
    status: 'active',
    summary: `Folder inside Private - Personal: ${item.Path}`,
    source: 'Dropbox',
    path: `Private - Personal/${item.Path}`,
    location: 'dropbox',
  }));
  const fileDocs = files.filter((item) => !item.IsDir).slice(0, 12).map<DocumentItem>((item) => ({
    id: `dropbox-file-${item.Path}`,
    title: item.Name ?? item.Path,
    type: item.MimeType?.includes('pdf') ? 'PDF' : 'Dropbox file',
    updatedAt: item.ModTime ? item.ModTime.slice(0, 10) : 'Unknown',
    status: 'active',
    summary: `Top-level file in Private - Personal${typeof item.Size === 'number' ? ` · ${item.Size.toLocaleString()} bytes` : ''}`,
    source: 'Dropbox',
    path: `Private - Personal/${item.Path}`,
    location: 'dropbox',
  }));
  return [...folderDocs, ...fileDocs];
}

export async function getMemories(): Promise<MemoryItem[]> {
  const workspaceMemories = await getWorkspaceMemories();
  if (workspaceMemories.length > 0) return workspaceMemories;
  return readJsonFile<MemoryItem[]>('memories.json');
}

export async function getDocuments(): Promise<DocumentItem[]> {
  const [workspaceDocs, dropboxDocs] = await Promise.all([getWorkspaceDocuments(), getDropboxDocuments()]);
  const combined = [...workspaceDocs, ...dropboxDocs];
  if (combined.length > 0) return combined;
  return readJsonFile<DocumentItem[]>('documents.json');
}

function normalizeTask(task: TaskItem): TaskItem {
  return { ...task, priority: task.priority ?? 'medium', scope: task.scope ?? 'personal', dueTime: task.dueTime ?? '', project: task.project ?? '', notes: task.notes ?? '' };
}

export async function getTasks(): Promise<TaskItem[]> {
  const tasks = await readJsonFile<TaskItem[]>('tasks.json');
  return tasks.map(normalizeTask);
}

export async function addTask(title: string, domain: string, dueDate?: string, priority: TaskPriority = 'medium', scope: TaskScope = 'personal', project = '', notes = '', dueTime = ''): Promise<TaskItem> {
  const tasks = await getTasks();
  const task: TaskItem = { id: `t${Date.now()}`, title, status: 'open', priority, scope, domain, dueDate: dueDate || new Date().toISOString().slice(0, 10), dueTime, project, notes };
  await writeJsonFile('tasks.json', [task, ...tasks]);
  return task;
}

export async function toggleTask(id: string): Promise<TaskItem | null> {
  const tasks = await getTasks();
  let changed: TaskItem | null = null;
  const updated = tasks.map((task) => {
    if (task.id !== id) return task;
    changed = { ...task, status: task.status === 'open' ? 'done' : 'open' };
    return changed;
  });
  await writeJsonFile('tasks.json', updated);
  return changed;
}

export async function updateTask(id: string, updates: Partial<Pick<TaskItem, 'title' | 'priority' | 'scope' | 'domain' | 'dueDate' | 'dueTime' | 'project' | 'notes'>>): Promise<TaskItem | null> {
  const tasks = await getTasks();
  let changed: TaskItem | null = null;
  const updatedTasks = tasks.map((task) => {
    if (task.id !== id) return task;
    changed = normalizeTask({ ...task, ...updates });
    return changed;
  });
  await writeJsonFile('tasks.json', updatedTasks);
  return changed;
}

export async function getDashboardData() {
  const [memories, documents, tasks] = await Promise.all([getMemories(), getDocuments(), getTasks()]);
  const openTasks = tasks.filter((task) => task.status === 'open');
  const doneTasks = tasks.filter((task) => task.status === 'done');
  const workspaceDocuments = documents.filter((document) => document.location === 'workspace');
  const dropboxDocuments = documents.filter((document) => document.location === 'dropbox');
  return {
    memories,
    documents,
    tasks,
    stats: {
      memories: memories.length,
      documents: documents.length,
      openTasks: openTasks.length,
      completedTasks: doneTasks.length,
      workspaceDocuments: workspaceDocuments.length,
      dropboxDocuments: dropboxDocuments.length,
    },
    spotlight: memories[0],
    nextTask: openTasks[0] ?? null,
    staleDocument: documents.find((document) => document.status === 'needs review') ?? documents[0] ?? null,
  };
}

function toDateOnly(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function compareDateOnly(a: string, b: string) {
  return new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime();
}

function buildDayLoad(upcomingEvents: CalendarEventItem[]): DayLoadItem[] {
  const buckets = new Map<string, string[]>();
  for (const event of upcomingEvents) {
    const raw = event.startDateRaw ?? event.start;
    const day = toDateOnly(raw);
    const list = buckets.get(day) ?? [];
    list.push(event.title);
    buckets.set(day, list);
  }
  return Array.from(buckets.entries())
    .map(([day, titles]) => ({ day, count: titles.length, titles, overloaded: titles.length >= 3 }))
    .sort((a, b) => compareDateOnly(a.day, b.day));
}

function buildTaskPressure(openTasks: TaskItem[]): TaskPressureItem[] {
  const today = new Date().toISOString().slice(0, 10);
  const soonThreshold = new Date();
  soonThreshold.setDate(soonThreshold.getDate() + 3);
  const soon = soonThreshold.toISOString().slice(0, 10);
  return openTasks
    .map<TaskPressureItem | null>((task) => {
      if (compareDateOnly(task.dueDate, today) < 0) return { taskId: task.id, title: task.title, dueDate: task.dueDate, priority: task.priority, domain: task.domain, timing: 'overdue' };
      if (task.dueDate === today) return { taskId: task.id, title: task.title, dueDate: task.dueDate, priority: task.priority, domain: task.domain, timing: 'today' };
      if (compareDateOnly(task.dueDate, soon) <= 0) return { taskId: task.id, title: task.title, dueDate: task.dueDate, priority: task.priority, domain: task.domain, timing: 'soon' };
      return null;
    })
    .filter((item): item is TaskPressureItem => item !== null)
    .sort((a, b) => compareDateOnly(a.dueDate, b.dueDate));
}

export async function getWeeklyReviewData() {
  const [{ memories, documents, tasks, stats }, upcomingEvents] = await Promise.all([getDashboardData(), getUpcomingCalendarEvents()]);
  const recentMemories = memories.slice(0, 5);
  const openTasks = tasks.filter((task) => task.status === 'open');
  const completedTasks = tasks.filter((task) => task.status === 'done').slice(0, 5);
  const staleDocuments = documents.filter((document) => document.status === 'needs review').slice(0, 6);
  const workspaceDocuments = documents.filter((document) => document.location === 'workspace').slice(0, 6);
  const dropboxHighlights = documents.filter((document) => document.location === 'dropbox').slice(0, 8);
  const dayLoad = buildDayLoad(upcomingEvents);
  const overloadedDays = dayLoad.filter((day) => day.overloaded);
  const taskPressure = buildTaskPressure(openTasks);
  const suggestedActions = [
    taskPressure[0] ? `Handle ${taskPressure[0].timing} task: ${taskPressure[0].title}` : null,
    overloadedDays[0] ? `Protect ${overloadedDays[0].day}: ${overloadedDays[0].count} calendar items already booked` : null,
    upcomingEvents[0] ? `Prepare for upcoming event: ${upcomingEvents[0].title}` : null,
    staleDocuments[0] ? `Review stale document: ${staleDocuments[0].title}` : null,
    recentMemories[0] ? `Resurface memory context from: ${recentMemories[0].title}` : null,
    dropboxHighlights[0] ? `Check whether Dropbox folder/file still matters: ${dropboxHighlights[0].title}` : null,
  ].filter(Boolean) as string[];
  return { stats, recentMemories, openTasks, completedTasks, staleDocuments, workspaceDocuments, dropboxHighlights, suggestedActions, upcomingEvents, dayLoad, overloadedDays, taskPressure };
}

function eventStartMinutes(event: CalendarEventItem) {
  if (!event.startDateTimeRaw || event.allDay) return null;
  const date = new Date(event.startDateTimeRaw);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function shortSender(from: string) {
  return from.split('<')[0]?.replaceAll('"', '').trim() || from;
}

function priorityRank(priority?: string) {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}

function sortTasksForBrief<T extends { priority?: string; dueDate?: string; dueTime?: string; title: string }>(tasks: T[]) {
  return [...tasks].sort((a, b) => (
    priorityRank(a.priority) - priorityRank(b.priority)
    || (a.dueTime ?? '').localeCompare(b.dueTime ?? '')
    || (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
    || a.title.localeCompare(b.title)
  ));
}

function buildBriefTaskLabel(task: { dueDate?: string; dueTime?: string }) {
  return task.dueTime ? `${task.dueDate} at ${task.dueTime}` : task.dueDate || 'No due date';
}

function buildConflictWarnings(events: CalendarEventItem[]) {
  const warnings: string[] = [];
  const sorted = [...events].sort((a, b) => (eventStartMinutes(a) ?? 0) - (eventStartMinutes(b) ?? 0));
  if (events.length >= 4) warnings.push(`Calendar is crowded today with ${events.length} items.`);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = eventStartMinutes(sorted[i - 1]);
    const next = eventStartMinutes(sorted[i]);
    if (prev !== null && next !== null && next - prev <= 60) {
      warnings.push(`Tight calendar spacing: ${sorted[i - 1].title} and ${sorted[i].title} are within an hour.`);
      break;
    }
  }
  return warnings;
}

export async function getMorningBriefData() {
  const [tasks, todaysEvents, inboxItems] = await Promise.all([getTasks(), getTodaysCalendarEvents(), getInboxThreads()]);
  const openTasks = tasks.filter((task) => task.status === 'open');
  const activeTasks = sortTasksForBrief(openTasks).slice(0, 8);
  const completedToday = tasks.filter((task) => task.status === 'done').slice(0, 4);
  const replyCandidates = [...inboxItems].sort((a, b) => (b.needsReplyScore ?? 0) - (a.needsReplyScore ?? 0)).filter((item) => (item.needsReplyScore ?? 0) >= 3).slice(0, 5);
  const conflictWarnings = buildConflictWarnings(todaysEvents);
  const todayKey = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const todayTasks = sortTasksForBrief(openTasks.filter((task) => task.dueDate === todayKey));
  const tomorrowTasks = sortTasksForBrief(openTasks.filter((task) => task.dueDate === tomorrowKey));
  const emailScan = inboxItems.slice(0, 6).map((item) => ({
    ...item,
    sender: shortSender(item.from),
    responseHint: (item.needsReplyScore ?? 0) >= 3 ? 'Reply likely' : 'Probably FYI',
  }));
  const summary = [
    todayTasks[0] ? `Today’s top task: ${todayTasks[0].title} (${buildBriefTaskLabel(todayTasks[0])}).` : 'No task due today surfaced.',
    tomorrowTasks[0] ? `Next up tomorrow: ${tomorrowTasks[0].title} (${buildBriefTaskLabel(tomorrowTasks[0])}).` : 'No task due tomorrow surfaced.',
    todaysEvents[0] ? `First calendar item: ${todaysEvents[0].title} at ${todaysEvents[0].start}.` : 'No calendar item surfaced for today.',
    replyCandidates[0] ? `Email most likely needing reply: ${shortSender(replyCandidates[0].from)}.` : 'No obvious reply-required email surfaced.',
    conflictWarnings[0] ?? null,
  ].filter(Boolean) as string[];
  const suggestedPriorities = [
    todayTasks[0] ? `Do first: ${todayTasks[0].title}` : null,
    todaysEvents[0] ? `Prepare for: ${todaysEvents[0].title}` : null,
    replyCandidates[0] ? `Reply to: ${shortSender(replyCandidates[0].from)}` : null,
    conflictWarnings[0] ? `Resolve calendar risk: ${conflictWarnings[0]}` : null,
  ].filter(Boolean) as string[];
  return {
    summary,
    activeTasks,
    todayTasks,
    tomorrowTasks,
    completedToday,
    todaysEvents,
    emailScan,
    replyCandidates,
    suggestedPriorities,
    conflictWarnings,
  };
}
