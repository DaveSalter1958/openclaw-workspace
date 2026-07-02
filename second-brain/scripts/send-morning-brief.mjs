#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const workspaceDir = '/home/davesalter/.openclaw/workspace';
const tasksPath = path.join(workspaceDir, 'second-brain', 'data', 'tasks.json');
const gmailAccount = 'drs@drs-engineering.net';
const recipient = 'drs@drs-engineering.net';
const logDir = path.join(workspaceDir, 'second-brain', 'logs');
const logPath = path.join(logDir, 'morning-brief.log');

function summarizeText(text, maxLength = 180) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'No summary available.';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

function shortSender(from) {
  return String(from || '').split('<')[0].replaceAll('"', '').trim() || String(from || 'Unknown sender');
}

function priorityRank(priority) {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}

function sortTasksForBrief(tasks) {
  return [...tasks].sort((a, b) => (
    priorityRank(a.priority) - priorityRank(b.priority)
    || String(a.dueTime || '').localeCompare(String(b.dueTime || ''))
    || String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
    || String(a.title || '').localeCompare(String(b.title || ''))
  ));
}

function scoreNeedsReply(item) {
  const text = `${item.from} ${item.subject} ${item.snippet || ''}`.toLowerCase();
  const from = String(item.from || '').toLowerCase();
  let score = 0;
  if (/newsletter|newsletters|amazon|rough country|phonefusion|voicemail|podcasts|cnn|icc|auto-confirm|labusinessjournal/.test(text)) score -= 6;
  if ((item.labels || []).join(' ').toLowerCase().match(/category_promotions|category_updates/)) score -= 2;
  if (from.includes('drs@drs-engineering.net')) score -= 8;
  if (/reply|respond|let me know|question|can you|could you|please|review|approval|confirm|meeting|schedule|invitation/.test(text)) score += 3;
  if (/alex|eric|brian|permit|correction|invoice|estimate|woodward/.test(text)) score += 2;
  if ((item.labels || []).join(' ').toLowerCase().match(/category_personal|important/)) score += 1;
  if (item.messageCount && item.messageCount > 1) score += 1;
  return score;
}

function eventStartMinutes(event) {
  const raw = event?.start?.dateTime;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function buildConflictWarnings(events) {
  const warnings = [];
  const sorted = [...events].sort((a, b) => (eventStartMinutes(a) ?? 0) - (eventStartMinutes(b) ?? 0));
  if (events.length >= 4) warnings.push(`Calendar is crowded today with ${events.length} items.`);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = eventStartMinutes(sorted[i - 1]);
    const next = eventStartMinutes(sorted[i]);
    if (prev !== null && next !== null && next - prev <= 60) {
      warnings.push(`Tight calendar spacing: ${sorted[i - 1].summary || 'Earlier event'} and ${sorted[i].summary || 'Later event'} are within an hour.`);
      break;
    }
  }
  return warnings;
}

const gogPath = '/usr/local/bin/gog';
const openclawPath = '/home/davesalter/.npm-global/bin/openclaw';
const telegramTarget = '8778247675';
const nonInteractiveEnv = { ...process.env, GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD ?? '' };

async function runJson(step, command, args) {
  try {
    const { stdout } = await execFileAsync(command, args, { env: nonInteractiveEnv, maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error) {
    error.step = step;
    error.command = command;
    error.args = args;
    throw error;
  }
}

async function runCommand(step, command, args) {
  try {
    return await execFileAsync(command, args, { env: nonInteractiveEnv, maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    error.step = step;
    error.command = command;
    error.args = args;
    throw error;
  }
}

async function main() {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);

  const tasks = JSON.parse(await fs.readFile(tasksPath, 'utf8'));
  const allOpenTasks = tasks.filter((task) => task.status === 'open');
  const openTasks = sortTasksForBrief(allOpenTasks).slice(0, 8);
  const completedTasks = tasks.filter((task) => task.status === 'done').slice(0, 4);

  const cal = await runJson('calendar events', gogPath, ['calendar', 'events', gmailAccount, '-a', gmailAccount, '--from', start.toISOString(), '--to', end.toISOString(), '--json']);
  const events = cal.events || [];

  const search = await runJson('gmail search inbox', gogPath, ['gmail', 'search', 'in:inbox newer_than:7d', '--max', '10', '-a', gmailAccount, '--json']);
  const threads = search.threads || [];
  const inboxItems = await Promise.all(threads.map(async (thread) => {
    let snippet = 'No snippet available.';
    try {
      const detail = await runJson(`gmail get ${thread.id}`, gogPath, ['gmail', 'get', thread.id, '-a', gmailAccount, '--json']);
      snippet = summarizeText(detail.snippet || detail.plainText || detail.text || '');
    } catch {}
    return { ...thread, snippet, needsReplyScore: scoreNeedsReply({ ...thread, snippet }) };
  }));
  const replyCandidates = [...inboxItems].sort((a, b) => (b.needsReplyScore || 0) - (a.needsReplyScore || 0)).filter((item) => (item.needsReplyScore || 0) >= 3).slice(0, 5);
  const conflictWarnings = buildConflictWarnings(events);
  const todayKey = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const todayTasks = sortTasksForBrief(allOpenTasks.filter((task) => task.dueDate === todayKey));
  const tomorrowTasks = sortTasksForBrief(allOpenTasks.filter((task) => task.dueDate === tomorrowKey));
  const emailScan = inboxItems.slice(0, 6).map((item) => ({
    ...item,
    sender: shortSender(item.from),
    responseHint: (item.needsReplyScore || 0) >= 3 ? 'Reply likely' : 'Probably FYI'
  }));

  const lines = [];
  lines.push('Morning Brief');
  lines.push('');
  lines.push('Summary');
  lines.push(todayTasks[0] ? `- Today’s top task: ${todayTasks[0].title}${todayTasks[0].dueTime ? ` at ${todayTasks[0].dueTime}` : ''}` : '- No task due today surfaced');
  lines.push(tomorrowTasks[0] ? `- Next up tomorrow: ${tomorrowTasks[0].title}${tomorrowTasks[0].dueTime ? ` at ${tomorrowTasks[0].dueTime}` : ''}` : '- No task due tomorrow surfaced');
  lines.push(`- ${events.length} calendar item(s) today`);
  lines.push(replyCandidates[0] ? `- Email most likely needing reply: ${shortSender(replyCandidates[0].from)}` : '- No obvious reply-needed email surfaced');
  if (conflictWarnings[0]) lines.push(`- ${conflictWarnings[0]}`);
  lines.push('');
  lines.push('Today');
  if (todayTasks.length) {
    for (const task of todayTasks) lines.push(`- [${task.priority}] ${task.title}${task.dueTime ? ` — ${task.dueTime}` : ''}${task.notes ? ` — ${task.notes}` : ''}`);
  } else {
    lines.push('- No tasks due today');
  }
  lines.push('');
  lines.push('Tomorrow');
  if (tomorrowTasks.length) {
    for (const task of tomorrowTasks) lines.push(`- [${task.priority}] ${task.title}${task.dueTime ? ` — ${task.dueTime}` : ''}${task.notes ? ` — ${task.notes}` : ''}`);
  } else {
    lines.push('- No tasks due tomorrow');
  }
  lines.push('');
  lines.push('Calendar today');
  if (events.length) {
    for (const event of events) {
      const when = event.start?.dateTime || event.start?.date || 'unknown time';
      lines.push(`- ${event.summary || 'Untitled event'} @ ${when}${event.location ? ` — ${event.location}` : ''}`);
    }
  } else {
    lines.push('- No events today');
  }
  lines.push('');
  lines.push('Email scan');
  if (emailScan.length) {
    for (const item of emailScan) lines.push(`- ${item.sender} — ${item.responseHint}`);
  } else {
    lines.push('- No inbox items surfaced');
  }
  lines.push('');
  lines.push('Recently completed');
  if (completedTasks.length) {
    for (const task of completedTasks) lines.push(`- ${task.title}`);
  } else {
    lines.push('- No completed tasks surfaced');
  }

  const body = lines.join('\n');
  const subject = `Morning Brief — ${now.toISOString().slice(0, 10)}`;

  await runCommand('gmail send morning brief', gogPath, ['gmail', 'send', '-a', gmailAccount, '--to', recipient, '--subject', subject, '--body', body]);

  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logPath, `[${new Date().toISOString()}] sent morning brief to ${recipient}\n`, 'utf8');
}

main().catch(async (error) => {
  await fs.mkdir(logDir, { recursive: true });
  const details = [
    `[${new Date().toISOString()}] FAILED morning brief`,
    error?.step ? `step=${error.step}` : null,
    error?.command ? `command=${error.command}` : null,
    Array.isArray(error?.args) ? `args=${JSON.stringify(error.args)}` : null,
    error?.code ? `code=${error.code}` : null,
    error?.stderr ? `stderr=${String(error.stderr).trim()}` : null,
    error?.stdout ? `stdout=${String(error.stdout).trim()}` : null,
    error?.stack || String(error),
    ''
  ].filter(Boolean).join('\n');
  await fs.appendFile(logPath, `${details}\n`, 'utf8');

  const alertLines = [
    'Morning brief failed.',
    error?.step ? `Step: ${error.step}` : null,
    error?.code ? `Code: ${error.code}` : null,
    error?.stderr ? `stderr: ${String(error.stderr).trim().slice(0, 800)}` : null,
    `Log: ${logPath}`
  ].filter(Boolean);

  try {
    await runCommand('telegram send failure alert', openclawPath, [
      'message',
      'send',
      '--channel',
      'telegram',
      '--target',
      telegramTarget,
      '--message',
      alertLines.join('\n')
    ]);
    await fs.appendFile(logPath, `[${new Date().toISOString()}] sent Telegram failure alert to ${telegramTarget}\n`, 'utf8');
  } catch (alertError) {
    const alertDetails = [
      `[${new Date().toISOString()}] FAILED Telegram alert`,
      alertError?.step ? `step=${alertError.step}` : null,
      alertError?.command ? `command=${alertError.command}` : null,
      Array.isArray(alertError?.args) ? `args=${JSON.stringify(alertError.args)}` : null,
      alertError?.code ? `code=${alertError.code}` : null,
      alertError?.stderr ? `stderr=${String(alertError.stderr).trim()}` : null,
      alertError?.stdout ? `stdout=${String(alertError.stdout).trim()}` : null,
      alertError?.stack || String(alertError),
      ''
    ].filter(Boolean).join('\n');
    await fs.appendFile(logPath, `${alertDetails}\n`, 'utf8');
  }

  process.exit(1);
});
