"use client";

import { useEffect, useState } from 'react';
import type { TaskBoardItem } from '@/lib/types';

type EmailAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

type EmailReplyHistoryItem = {
  id: string;
  source: 'Gmail' | 'Mission Control';
  direction?: 'incoming' | 'outgoing';
  from: string;
  to?: string;
  date: string;
  subject?: string;
  body: string;
};

function emailDateLabel(value?: string) {
  if (!value) return 'Date unknown';
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function cleanTitle(item: TaskBoardItem) {
  return (item.emailSubject || item.title)
    .replace(/^(Review\/respond|Review\/reply):\s*/i, '')
    .trim();
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

function sourceAccount(item: TaskBoardItem) {
  const match = (item.notes || '').match(/^Source account:\s*(.+)$/im);
  return match ? match[1].trim() : item.project.replace('Email — ', '');
}

function lineValue(notes: string | undefined, label: string) {
  const line = (notes || '').split(/\r?\n/).find((item) => item.startsWith(`${label}:`));
  return line ? line.slice(label.length + 1).trim() : '';
}

function attachmentSizeLabel(size: number) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function emailReplyDateValue(reply: EmailReplyHistoryItem) {
  const parsed = Date.parse(reply.date || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortRepliesOldestFirst(replies: EmailReplyHistoryItem[]) {
  return [...replies].sort((a, b) => emailReplyDateValue(a) - emailReplyDateValue(b));
}

function senderName(value: string) {
  const trimmed = value.trim();
  const emailOnly = trimmed.match(/^<?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>?$/i);
  if (emailOnly) return trimmed.replace(/[<>]/g, '');
  const quoted = trimmed.match(/^"([^"]+)"\s*</);
  if (quoted) return quoted[1];
  const angle = trimmed.indexOf('<');
  return (angle > 0 ? trimmed.slice(0, angle) : trimmed).replace(/^"|"$/g, '').trim() || trimmed;
}

function dialogueLabel(reply: EmailReplyHistoryItem) {
  if (reply.direction === 'outgoing') return 'You replied';
  return `${senderName(reply.from) || 'They'} said`;
}

function actionHistory(notes?: string) {
  const text = notes || '';
  const index = text.indexOf('Action history:');
  if (index < 0) return [] as string[];
  return text
    .slice(index + 'Action history:'.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function emailBodyText(item: TaskBoardItem) {
  if (item.emailBody?.trim()) return latestEmailText(item.emailBody);
  const marker = 'Email body:';
  const notes = item.notes || '';
  const index = notes.indexOf(marker);
  if (index < 0) return '';
  return latestEmailText(notes.slice(index + marker.length));
}

function emailFromLabel(item: TaskBoardItem) {
  return item.emailFrom || lineValue(item.notes, 'From') || 'Unknown';
}

function gmailMessageUrl(item: TaskBoardItem) {
  const account = sourceAccount(item).match(/<([^>]+)>/)?.[1] || sourceAccount(item);
  const messageId = lineValue(item.notes, 'Gmail message ID') || lineValue(item.notes, 'Thread ID');
  if (!messageId) return '';
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}#all/${encodeURIComponent(messageId)}`;
}

function emailSummary(item: TaskBoardItem) {
  return [
    { label: 'Date', value: emailDateLabel(item.emailDate || lineValue(item.notes, 'Date')) },
    { label: 'Subject', value: cleanTitle(item) },
  ];
}

export function EmailTaskColumn({ items }: { items: TaskBoardItem[] }) {
  const [active, setActive] = useState<TaskBoardItem | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [replyLaterIds, setReplyLaterIds] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState('');
  const [replyFiles, setReplyFiles] = useState<FileList | null>(null);
  const [replyStatus, setReplyStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [attachmentsStatus, setAttachmentsStatus] = useState('');
  const [threadReplies, setThreadReplies] = useState<EmailReplyHistoryItem[]>([]);
  const [threadHistoryStatus, setThreadHistoryStatus] = useState('');
  const [originalEmailHtml, setOriginalEmailHtml] = useState('');
  const [originalEmailStatus, setOriginalEmailStatus] = useState('');

  useEffect(() => {
    if (!active) {
      setAttachments([]);
      setAttachmentsStatus('');
      setThreadReplies([]);
      setThreadHistoryStatus('');
      setOriginalEmailHtml('');
      setOriginalEmailStatus('');
      return;
    }
    let cancelled = false;
    setAttachments([]);
    setAttachmentsStatus('Checking for attachments…');
    setOriginalEmailHtml('');
    setOriginalEmailStatus('Loading original email…');
    fetch(`/mission-control/api/tasks/email-original?taskId=${encodeURIComponent(active.id)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load original email.');
        return String(data.html || '');
      })
      .then((html) => {
        if (cancelled) return;
        setOriginalEmailHtml(html);
        setOriginalEmailStatus(html ? '' : 'No email body saved.');
      })
      .catch((originalError) => {
        if (cancelled) return;
        setOriginalEmailStatus(originalError instanceof Error ? originalError.message : 'Could not load original email.');
      });

    fetch(`/mission-control/api/tasks/email-attachments?taskId=${encodeURIComponent(active.id)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load attachments.');
        return data.attachments as EmailAttachment[];
      })
      .then((items) => {
        if (cancelled) return;
        setAttachments(items || []);
        setAttachmentsStatus(items?.length ? '' : 'No attachments.');
      })
      .catch((attachmentError) => {
        if (cancelled) return;
        setAttachmentsStatus(attachmentError instanceof Error ? attachmentError.message : 'Could not load attachments.');
      });

    setThreadReplies([]);
    setThreadHistoryStatus('Loading email chain…');
    fetch(`/mission-control/api/tasks/email-thread-history?taskId=${encodeURIComponent(active.id)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load email chain.');
        return data.replies as EmailReplyHistoryItem[];
      })
      .then((items) => {
        if (cancelled) return;
        setThreadReplies(sortRepliesOldestFirst(items || []));
        setThreadHistoryStatus(items?.length ? '' : 'No email chain found for this thread.');
      })
      .catch((historyError) => {
        if (cancelled) return;
        setThreadHistoryStatus(historyError instanceof Error ? historyError.message : 'Could not load email chain.');
      });
    return () => { cancelled = true; };
  }, [active]);

  function setBusy(id: string, busy: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openTask(item: TaskBoardItem) {
    setActive(item);
    setReplyText('');
    setReplyFiles(null);
    setReplyStatus('');
    setError('');
  }

  function openReply(item: TaskBoardItem) {
    openTask(item);
  }

  async function submitReply() {
    if (!active || !replyText.trim()) return;
    if (!window.confirm(`Send this email reply from ${sourceAccount(active)} now?`)) return;
    setSending(true);
    setReplyStatus('Sending reply...');
    const formData = new FormData();
    formData.append('taskId', active.id);
    formData.append('body', replyText);
    formData.append('mode', 'send');
    Array.from(replyFiles || []).forEach((file) => formData.append('attachments', file));
    const response = await fetch('/mission-control/api/tasks/email-reply', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    setSending(false);
    if (!response.ok) {
      setReplyStatus(data.error || 'Reply failed.');
      return;
    }
    const actionStamp = new Date().toISOString();
    const replySummary = replyText.replace(/\s+/g, ' ').trim();
    setReplyStatus(`Reply sent from ${data.account}. Task kept active.`);
    setActive({
      ...active,
      notes: `${(active.notes || '').trim()}\n\nAction history:\n- ${actionStamp}: Reply sent from ${data.account}.\n  Reply summary: ${replySummary}`.trim(),
    });
    setReplyText('');
    setReplyFiles(null);
  }

  async function markReplyLater(item: TaskBoardItem) {
    setError('');
    setReplyStatus('Marked for reply later.');
    const notes = item.notes || '';
    const nextNotes = /(^|\n)Reply later:/i.test(notes) ? notes : `${notes.trim()}\n\nReply later: true`.trim();
    setBusy(item.id, true);
    const response = await fetch(`/mission-control/api/tasks/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: nextNotes }),
    });
    setBusy(item.id, false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'Could not mark reply later.');
      setReplyStatus('');
      return;
    }
    setReplyLaterIds((current) => new Set([...current, item.id]));
    setActive(null);
  }

  async function completeTask(item: TaskBoardItem) {
    setError('');
    setBusy(item.id, true);
    const response = await fetch(`/mission-control/api/tasks/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    setBusy(item.id, false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'Could not mark task completed.');
      return;
    }
    setHiddenIds((current) => new Set([...current, item.id]));
    if (active?.id === item.id) setActive(null);
  }

  async function deleteTask(item: TaskBoardItem) {
    if (!window.confirm(`Delete task: ${cleanTitle(item)}?`)) return;
    setError('');
    setBusy(item.id, true);
    const response = await fetch(`/mission-control/api/tasks/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    setBusy(item.id, false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || 'Could not delete task.');
      return;
    }
    setHiddenIds((current) => new Set([...current, item.id]));
    if (active?.id === item.id) setActive(null);
  }

  async function handleEmailAction(item: TaskBoardItem, action: 'ignore-task' | 'trash-email') {
    setError('');
    setReplyStatus(action === 'trash-email' ? 'Deleting email from Gmail…' : 'Ignoring task…');
    setBusy(item.id, true);
    const response = await fetch('/mission-control/api/tasks/email-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: item.id, action }),
    });
    setBusy(item.id, false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const fallback = action === 'trash-email' ? 'Could not delete email from Gmail.' : 'Could not ignore task.';
      setError(data.error || fallback);
      setReplyStatus('');
      return;
    }
    setHiddenIds((current) => new Set([...current, item.id]));
    setActive(null);
    setReplyStatus('');
  }

  const visibleItems = items.filter((item) => !hiddenIds.has(item.id));

  return (
    <>
      <div className="reference-column email-task-column compact-task-column">
        <div className="reference-column-head">
          <span className="reference-column-label">Tasks from Email</span>
          <span>{visibleItems.length}</span>
        </div>
        <div className="reference-card-stack compact-task-stack">
          {visibleItems.length > 0 ? visibleItems.map((item) => {
            const busy = busyIds.has(item.id);
            return (
              <article className={`compact-task-row email-compact-task-row clickable-task-row ${replyLaterIds.has(item.id) || /(^|\n)Reply later:/i.test(item.notes || '') ? 'email-reply-later-row' : ''}`} key={item.id} onClick={() => openTask(item)}>
                <span className="compact-task-title" title={cleanTitle(item)}>{cleanTitle(item)}</span>
                <div className="compact-task-actions">
                  <button className="compact-task-button reply" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); openTask(item); }}>Open</button>
                </div>
              </article>
            );
          }) : <div className="reference-empty-card compact-empty compact-task-empty">No email tasks</div>}
          {error ? <p className="muted small compact-task-error">{error}</p> : null}
        </div>
      </div>

      {active ? (
        <div className="email-task-modal-backdrop" onClick={() => setActive(null)}>
          <section className="email-task-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-title email-modal-title-bar">
              <div className="email-modal-title-text">
                <h2 className="email-modal-from-line"><span>Email From:</span> {emailFromLabel(active)}</h2>
                <p className="email-modal-date-line"><span>Date:</span> {emailDateLabel(active.emailDate || lineValue(active.notes, 'Date'))}</p>
              </div>
              <div className="email-modal-header-actions">
                {gmailMessageUrl(active) ? <a className="button secondary email-modal-top-button" href={gmailMessageUrl(active)} target="_blank" rel="noreferrer">Open in Gmail</a> : null}
                <button className="button secondary email-modal-top-button" type="button" onClick={() => setActive(null)}>Close</button>
              </div>
            </div>
            <div className="email-task-modal-meta">
              {emailSummary(active).map((item) => (
                <p key={item.label}><strong>{item.label}:</strong> {item.value}</p>
              ))}
            </div>
            <div className="email-original-message">
              <h3>Original email</h3>
              {originalEmailHtml ? (
                <iframe className="email-original-frame" title="Original email" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={originalEmailHtml} />
              ) : originalEmailStatus && !originalEmailStatus.startsWith('Loading') ? (
                <pre>{emailBodyText(active) || originalEmailStatus}</pre>
              ) : <p className="muted small">{originalEmailStatus || 'Loading original email…'}</p>}
            </div>
            <div className="email-attachments-panel">
              <h3>Attachments</h3>
              {attachments.length > 0 ? (
                <ul>
                  {attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        className="button secondary email-attachment-download"
                        href={`/mission-control/api/tasks/email-attachments?taskId=${encodeURIComponent(active.id)}&attachmentId=${encodeURIComponent(attachment.id)}&filename=${encodeURIComponent(attachment.filename)}`}
                      >
                        Download {attachment.filename}
                      </a>
                      <span className="muted small">{attachment.mimeType}{attachmentSizeLabel(attachment.size) ? ` · ${attachmentSizeLabel(attachment.size)}` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small">{attachmentsStatus || 'No attachments.'}</p>}
            </div>
            <div className="email-conversation-summary">
              <h3>Email chain</h3>
              {threadReplies.length > 0 ? (
                <ul className="email-thread-replies">
                  {threadReplies.map((reply) => (
                    <li className={`email-dialogue-item ${reply.direction === 'outgoing' ? 'you-replied' : 'they-said'}`} key={reply.id}>
                      <div className="email-dialogue-heading">
                        <strong>{dialogueLabel(reply)}:</strong>
                        <span>{emailDateLabel(reply.date)}</span>
                      </div>
                      <pre>“{reply.body || '(no body saved)'}”</pre>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small">{threadHistoryStatus || 'No email chain found for this thread.'}</p>}
            </div>
            <div className="email-reply-composer">
              <label>
                <span className="muted small">Reply from the receiving Gmail account</span>
                <textarea className="input" rows={7} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Type your reply here..." />
              </label>
              <label className="email-reply-attachments-input">
                <span className="muted small">Attach files from this computer</span>
                <input className="input" type="file" multiple onChange={(event) => setReplyFiles(event.target.files)} />
              </label>
              <div className="footer-actions email-modal-actions">
                <button className="button" type="button" disabled={sending || !replyText.trim()} onClick={submitReply}>Reply</button>
                <button className="button secondary" type="button" disabled={sending || busyIds.has(active.id)} onClick={() => markReplyLater(active)}>Reply Later</button>
                <button className="button danger" type="button" disabled={sending || busyIds.has(active.id)} onClick={() => handleEmailAction(active, 'trash-email')}>Delete</button>
                <button className="button secondary" type="button" disabled={sending || busyIds.has(active.id)} onClick={() => handleEmailAction(active, 'ignore-task')}>Ignore</button>
                {replyStatus ? <p className="muted small">{replyStatus}</p> : null}
                {error ? <p className="muted small compact-task-error">{error}</p> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
