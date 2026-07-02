import type { TaskPriority, TaskScope } from '@/lib/types';

export type ParsedTaskCapture = {
  title: string;
  dueDate?: string;
  dueTime?: string;
  priority: TaskPriority;
  scope: TaskScope;
  domain: string;
  project?: string;
  notes?: string;
  sourceText: string;
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseRelativeDay(text: string): string | undefined {
  const now = new Date();
  const lowered = text.toLowerCase();

  if (lowered.includes('today')) return dateOnly(now);
  if (lowered.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return dateOnly(d);
  }

  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for (const [index, day] of weekdays.entries()) {
    const nextPattern = new RegExp(`next\\s+${day}`);
    const plainPattern = new RegExp(`\\b${day}\\b`);
    if (nextPattern.test(lowered) || plainPattern.test(lowered)) {
      const d = new Date(now);
      const current = d.getDay();
      let delta = (index - current + 7) % 7;
      if (delta === 0 || nextPattern.test(lowered)) delta += 7;
      d.setDate(d.getDate() + delta);
      return dateOnly(d);
    }
  }

  const inDays = lowered.match(/in\s+(\d+)\s+day/);
  if (inDays) {
    const d = new Date(now);
    d.setDate(d.getDate() + Number(inDays[1]));
    return dateOnly(d);
  }

  return undefined;
}

function parseTime(text: string): string | undefined {
  const lowered = text.toLowerCase();
  const match = lowered.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = match[2] ?? '00';
  const meridiem = match[3].replace(/\./g, '');

  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function parsePriority(text: string): TaskPriority {
  const lowered = text.toLowerCase();
  if (lowered.includes('high priority') || lowered.includes('urgent')) return 'high';
  if (lowered.includes('low priority')) return 'low';
  return 'medium';
}

function parseScope(text: string): TaskScope {
  const lowered = text.toLowerCase();
  if (lowered.includes('business') || lowered.includes('work')) return 'business';
  return 'personal';
}

function parseDomain(text: string): string {
  const lowered = text.toLowerCase();
  if (lowered.includes('painting') || lowered.includes('art')) return 'creative';
  if (lowered.includes('memory') || lowered.includes('journal')) return 'memories';
  if (lowered.includes('document') || lowered.includes('file')) return 'documents';
  if (lowered.includes('review')) return 'review';
  return 'general';
}

function cleanupTitle(text: string): string {
  return text
    .replace(/^\s*(add|create|remember|remind me to|set|task:?|please)\s+/i, '')
    .replace(/\b(high|medium|low) priority\b/gi, '')
    .replace(/\b(business|personal|work)\b/gi, '')
    .replace(/\bfor\s+(today|tomorrow|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '');
}

export function parseTaskCapture(input: string): ParsedTaskCapture {
  const [mainPart, notesPartRaw] = input.split(/notes?:/i);
  const mainPartTrimmed = mainPart.trim();
  const notesPart = notesPartRaw?.trim();

  const projectMatch = input.match(/project:\s*([^.;\n]+)/i);
  const project = projectMatch?.[1]?.trim();

  return {
    title: cleanupTitle(mainPartTrimmed),
    dueDate: parseRelativeDay(input),
    dueTime: parseTime(input),
    priority: parsePriority(input),
    scope: parseScope(input),
    domain: parseDomain(input),
    project,
    notes: notesPart,
    sourceText: input,
  };
}
