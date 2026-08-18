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

export type WoodsDriveProject = {
  name: string;
  updatedAt: string;
  actions: WoodsDriveAction[];
};

const projectPath = path.join(process.cwd(), 'data', 'woods-drive-project.json');

const defaultProject: WoodsDriveProject = {
  name: 'Woods Drive Project',
  updatedAt: '',
  actions: [],
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
    };
  } catch {
    return defaultProject;
  }
}

export async function saveWoodsDriveActions(actions: Partial<WoodsDriveAction>[]): Promise<WoodsDriveProject> {
  const project: WoodsDriveProject = {
    name: defaultProject.name,
    updatedAt: new Date().toISOString(),
    actions: actions.map((action, index) => cleanAction(action, index)).filter((action) => action.text || action.dueDate || action.responsible || action.notes),
  };

  await fs.mkdir(path.dirname(projectPath), { recursive: true });
  await fs.writeFile(projectPath, JSON.stringify(project, null, 2) + '\n', 'utf8');
  return project;
}
