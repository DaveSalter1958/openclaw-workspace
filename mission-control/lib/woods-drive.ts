import { promises as fs } from 'fs';
import path from 'path';

export type WoodsDriveAction = {
  id: string;
  sourceId: string;
  phase: string;
  text: string;
  dueDate: string;
  responsible: string;
  priority: string;
  status: string;
  notes: string;
  done: boolean;
};

export type WoodsDriveDocument = {
  id: string;
  title: string;
  category: string;
  url: string;
  path: string;
  notes: string;
  status: string;
};

export type WoodsDriveScheduleItem = {
  id: string;
  title: string;
  phase: string;
  startDate: string;
  endDate: string;
  owner: string;
  status: string;
  notes: string;
};

export type WoodsDriveProject = {
  name: string;
  updatedAt: string;
  actions: WoodsDriveAction[];
  schedule: WoodsDriveScheduleItem[];
  documents: WoodsDriveDocument[];
};

const projectPath = path.join(process.cwd(), 'data', 'woods-drive-project.json');

const defaultProject: WoodsDriveProject = {
  name: 'Woods Drive Project',
  updatedAt: '',
  actions: [],
  schedule: [],
  documents: [],
};

function cleanAction(value: Partial<WoodsDriveAction>, index: number): WoodsDriveAction {
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : `woods-action-${Date.now()}-${index}`;
  return {
    id,
    sourceId: typeof value.sourceId === 'string' ? value.sourceId.trim() : '',
    phase: typeof value.phase === 'string' ? value.phase.trim() : '',
    text: typeof value.text === 'string' ? value.text.trim() : '',
    dueDate: typeof value.dueDate === 'string' ? value.dueDate : '',
    responsible: typeof value.responsible === 'string' ? value.responsible.trim() : '',
    priority: typeof value.priority === 'string' ? value.priority.trim() : '',
    status: typeof value.status === 'string' ? value.status.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    done: Boolean(value.done),
  };
}

function cleanScheduleItem(value: Partial<WoodsDriveScheduleItem>, index: number): WoodsDriveScheduleItem {
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : `woods-schedule-${Date.now()}-${index}`;
  return {
    id,
    title: typeof value.title === 'string' ? value.title.trim() : '',
    phase: typeof value.phase === 'string' ? value.phase.trim() : '',
    startDate: typeof value.startDate === 'string' ? value.startDate.trim() : '',
    endDate: typeof value.endDate === 'string' ? value.endDate.trim() : '',
    owner: typeof value.owner === 'string' ? value.owner.trim() : '',
    status: typeof value.status === 'string' ? value.status.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
  };
}

function cleanDocument(value: Partial<WoodsDriveDocument>, index: number): WoodsDriveDocument {
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : `woods-document-${Date.now()}-${index}`;
  return {
    id,
    title: typeof value.title === 'string' ? value.title.trim() : '',
    category: typeof value.category === 'string' ? value.category.trim() : '',
    url: typeof value.url === 'string' ? value.url.trim() : '',
    path: typeof value.path === 'string' ? value.path.trim() : '',
    notes: typeof value.notes === 'string' ? value.notes.trim() : '',
    status: typeof value.status === 'string' ? value.status.trim() : '',
  };
}

export async function getWoodsDriveProject(): Promise<WoodsDriveProject> {
  try {
    const raw = await fs.readFile(projectPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WoodsDriveProject>;
    return {
      name: parsed.name || defaultProject.name,
      updatedAt: parsed.updatedAt || '',
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.map((action, index) => cleanAction(action, index)).filter((action) => action.text || action.dueDate || action.responsible || action.notes)
        : [],
      schedule: Array.isArray(parsed.schedule)
        ? parsed.schedule.map((item, index) => cleanScheduleItem(item, index)).filter((item) => item.title || item.startDate || item.endDate || item.notes)
        : [],
      documents: Array.isArray(parsed.documents)
        ? parsed.documents.map((document, index) => cleanDocument(document, index)).filter((document) => document.title || document.url || document.path)
        : [],
    };
  } catch {
    return defaultProject;
  }
}

export async function saveWoodsDriveActions(actions: Partial<WoodsDriveAction>[]): Promise<WoodsDriveProject> {
  const existing = await getWoodsDriveProject();
  const documents = existing.documents;
  const schedule = existing.schedule;

  const project: WoodsDriveProject = {
    name: defaultProject.name,
    updatedAt: new Date().toISOString(),
    actions: actions.map((action, index) => cleanAction(action, index)).filter((action) => action.text || action.dueDate || action.responsible || action.notes),
    schedule,
    documents,
  };

  await fs.mkdir(path.dirname(projectPath), { recursive: true });
  await fs.writeFile(projectPath, JSON.stringify(project, null, 2) + '\n', 'utf8');
  return project;
}

export async function saveWoodsDriveDocuments(documents: Partial<WoodsDriveDocument>[]): Promise<WoodsDriveProject> {
  const existing = await getWoodsDriveProject();
  const project: WoodsDriveProject = {
    name: defaultProject.name,
    updatedAt: new Date().toISOString(),
    actions: existing.actions,
    schedule: existing.schedule,
    documents: documents.map((document, index) => cleanDocument(document, index)),
  };

  await fs.mkdir(path.dirname(projectPath), { recursive: true });
  await fs.writeFile(projectPath, JSON.stringify(project, null, 2) + '\n', 'utf8');
  return project;
}

export async function saveWoodsDriveSchedule(schedule: Partial<WoodsDriveScheduleItem>[]): Promise<WoodsDriveProject> {
  const existing = await getWoodsDriveProject();
  const project: WoodsDriveProject = {
    name: defaultProject.name,
    updatedAt: new Date().toISOString(),
    actions: existing.actions,
    schedule: schedule.map((item, index) => cleanScheduleItem(item, index)).filter((item) => item.title || item.startDate || item.endDate || item.notes),
    documents: existing.documents,
  };

  await fs.mkdir(path.dirname(projectPath), { recursive: true });
  await fs.writeFile(projectPath, JSON.stringify(project, null, 2) + '\n', 'utf8');
  return project;
}

export async function getWoodsDriveDocument(id: string): Promise<WoodsDriveDocument | null> {
  try {
    const project = await getWoodsDriveProject();
    return project.documents.find((document) => document.id === id) || null;
  } catch {
    return null;
  }
}
