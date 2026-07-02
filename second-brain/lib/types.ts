export type MemoryItem = {
  id: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  energy: 'restorative' | 'reflective' | 'practical';
  source: string;
  kind: 'long-term' | 'daily';
};

export type DocumentItem = {
  id: string;
  title: string;
  type: string;
  updatedAt: string;
  status: 'active' | 'needs review' | 'archived';
  summary: string;
  source: string;
  path?: string;
  location?: 'workspace' | 'dropbox';
};

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskScope = 'business' | 'personal';

export type TaskItem = {
  id: string;
  title: string;
  status: 'open' | 'done';
  priority: TaskPriority;
  scope: TaskScope;
  domain: string;
  dueDate: string;
  dueTime?: string;
  project?: string;
  notes?: string;
};

export type CalendarEventItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  source: string;
  location?: string;
  status?: string;
  startDateRaw?: string;
  startDateTimeRaw?: string;
};

export type DayLoadItem = {
  day: string;
  count: number;
  titles: string[];
  overloaded: boolean;
};

export type TaskPressureItem = {
  taskId: string;
  title: string;
  dueDate: string;
  priority: TaskPriority;
  domain: string;
  timing: 'overdue' | 'today' | 'soon';
};

export type EmailItem = {
  id: string;
  date: string;
  from: string;
  subject: string;
  labels: string[];
  messageCount?: number;
  snippet?: string;
  needsReplyScore?: number;
};
