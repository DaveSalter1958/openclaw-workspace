export type ToolIdeaStatus = 'discovery' | 'building' | 'ready';
export type ModuleType = 'ingest' | 'model' | 'automation' | 'review';
export type ModuleState = 'planned' | 'live';
export type WorkflowStatus = 'draft' | 'active';
export type ToolBlueprintStatus = 'concept' | 'designing' | 'ready';

export interface ToolIdea {
  id: string;
  name: string;
  status: ToolIdeaStatus;
  owner: string;
  problem: string;
  users: string[];
  outputs: string[];
  nextStep: string;
  tags: string[];
  updatedAt: string;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  type: ModuleType;
  description: string;
  inputs: string[];
  outputs: string[];
  state: ModuleState;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  goal: string;
  status: WorkflowStatus;
  trigger: string;
  steps: string[];
  owner: string;
  moduleIds?: string[];
}

export interface ToolBlueprint {
  id: string;
  name: string;
  purpose: string;
  owner: string;
  status: ToolBlueprintStatus;
  workflowIds: string[];
  moduleIds: string[];
  expectedInputs: string[];
  expectedOutputs: string[];
}

export interface QueueItem {
  title: string;
  priority: 'high' | 'medium' | 'low';
  why: string;
}

export interface MissionControlData {
  toolIdeas: ToolIdea[];
  modules: ModuleDefinition[];
  workflows: WorkflowDefinition[];
  toolBlueprints: ToolBlueprint[];
  buildQueue: QueueItem[];
}

export interface CalendarEventItem {
  id: string;
  summary: string;
  startLabel: string;
  startSort: string;
  endLabel?: string;
  location?: string;
  source: 'google';
  link?: string;
  allDay?: boolean;
}

export interface ProjectCalendarItem {
  id: string;
  title: string;
  dueLabel: string;
  dueSort: string;
  project: string;
  source: 'task';
  priority: 'low' | 'medium' | 'high';
  notes?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: 'active' | 'planned' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  owner: string;
  nextStep: string;
  dueLabel?: string;
  dueSort?: string;
  taskCount: number;
  blocker?: string;
  notes?: string;
  linkedTasks: Array<{
    id: string;
    title: string;
    dueLabel?: string;
    priority: 'low' | 'medium' | 'high';
    notes?: string;
  }>;
}

export interface TaskBoardItem {
  id: string;
  title: string;
  dueLabel?: string;
  dueSort?: string;
  priority: 'low' | 'medium' | 'high';
  project: string;
  notes?: string;
}

export interface DailyMemoryEntry {
  date: string;
  title: string;
  summary: string;
  file: string;
  lineCount: number;
  highlights: string[];
}

export interface MemoryDashboardData {
  entries: DailyMemoryEntry[];
  latest?: DailyMemoryEntry | null;
}
