#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const workspaceDir = '/home/davesalter/.openclaw/workspace';
const projectPath = path.join(workspaceDir, 'mission-control', 'data', 'woods-drive-project.json');
const logDir = path.join(workspaceDir, 'memory');
const logPath = path.join(logDir, 'woods-drive-pm-reminder.log');
const openclawPath = '/home/davesalter/.npm-global/bin/openclaw';
const telegramTarget = '8778247675';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const forceSend = args.has('--force-send');

function localDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function parseDateKey(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const timestamp = Date.parse(`${text}T00:00:00-07:00`);
  return Number.isFinite(timestamp) ? text : null;
}

function daysBetween(dateKey, todayKey) {
  const date = Date.parse(`${dateKey}T00:00:00-07:00`);
  const today = Date.parse(`${todayKey}T00:00:00-07:00`);
  return Math.round((date - today) / 86400000);
}

function priorityRank(action) {
  const priority = String(action.priority || '').toLowerCase();
  if (priority === 'urgent') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  return 3;
}

function dueRank(action, todayKey) {
  const dueKey = parseDateKey(action.dueDate);
  if (!dueKey) {
    const due = String(action.dueDate || '').toLowerCase();
    if (due === 'asap') return 0.5;
    if (due.includes('before')) return 50;
    if (due === 'ongoing') return 100;
    return 200;
  }
  return daysBetween(dueKey, todayKey);
}

function isOpen(action) {
  return !action.done && String(action.status || '').toLowerCase() !== 'done';
}

function actionLine(action) {
  const due = action.dueDate ? ` due ${action.dueDate}` : '';
  const owner = action.responsible ? ` (${action.responsible})` : '';
  return `- ${action.sourceId || action.id}: ${action.text}${due}${owner}`;
}

function buildMessage(project, todayKey) {
  const open = (project.actions || []).filter(isOpen);
  const urgent = open.filter((action) => String(action.priority || '').toLowerCase() === 'urgent');
  const overdue = open.filter((action) => {
    const dueKey = parseDateKey(action.dueDate);
    return dueKey && daysBetween(dueKey, todayKey) < 0;
  });
  const dueSoon = open.filter((action) => {
    const dueKey = parseDateKey(action.dueDate);
    if (!dueKey) return false;
    const days = daysBetween(dueKey, todayKey);
    return days >= 0 && days <= 7;
  });
  const asap = open.filter((action) => String(action.dueDate || '').toLowerCase() === 'asap');

  const ranked = [...new Map([...urgent, ...overdue, ...dueSoon, ...asap, ...open]
    .map((action) => [action.id, action])).values()]
    .sort((a, b) => (
      priorityRank(a) - priorityRank(b)
      || dueRank(a, todayKey) - dueRank(b, todayKey)
      || String(a.sourceId || a.id).localeCompare(String(b.sourceId || b.id))
    ));

  if (!forceSend && urgent.length === 0 && overdue.length === 0 && dueSoon.length === 0 && asap.length === 0) {
    return null;
  }

  const lines = [
    `Woods Drive PM reminder - ${todayKey}`,
    `${open.length} open actions. ${urgent.length} urgent, ${overdue.length} overdue, ${asap.length} ASAP.`,
    '',
    'Top items:',
    ...ranked.slice(0, 7).map(actionLine),
  ];

  const schedule = project.schedule || [];
  const nextMilestone = schedule
    .filter((item) => parseDateKey(item.startDate) && daysBetween(item.startDate, todayKey) >= 0)
    .sort((a, b) => daysBetween(a.startDate, todayKey) - daysBetween(b.startDate, todayKey))[0];

  if (nextMilestone) {
    lines.push('', `Next schedule item: ${nextMilestone.title} on ${nextMilestone.startDate}.`);
  }

  lines.push('', 'I can draft messages/checklists locally; I will ask before external sends or Dropbox changes.');
  return lines.join('\n');
}

async function sendTelegram(message) {
  await execFileAsync(openclawPath, [
    'message',
    'send',
    '--channel',
    'telegram',
    '--target',
    telegramTarget,
    '--message',
    message,
  ], { maxBuffer: 1024 * 1024 });
}

async function appendLog(line) {
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
}

async function main() {
  const raw = await fs.readFile(projectPath, 'utf8');
  const project = JSON.parse(raw);
  const todayKey = localDateKey();
  const message = buildMessage(project, todayKey);

  if (!message) {
    await appendLog('no reminder sent: no urgent, overdue, due-soon, or ASAP Woods Drive actions');
    return;
  }

  if (dryRun) {
    console.log(message);
    await appendLog('dry run completed');
    return;
  }

  await sendTelegram(message);
  await appendLog(`sent Woods Drive PM reminder to Telegram target ${telegramTarget}`);
}

main().catch(async (error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  await appendLog(`ERROR ${detail.replace(/\s+/g, ' ')}`).catch(() => {});
  console.error(detail);
  process.exit(1);
});
