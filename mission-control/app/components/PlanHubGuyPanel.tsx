"use client";

import { useEffect, useRef, useState, useTransition } from 'react';
import { PlanHubGuyTemplatesEditor } from '@/app/components/PlanHubGuyTemplatesEditor';

type QueueLabel = 'Possible Work' | 'Follow up';

type ReplyQueueItem = {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  bodyPreview?: string;
  labels: string[];
  isUnread?: boolean;
  isResponded?: boolean;
  isAutomatic?: boolean;
  isFollowUp?: boolean;
  isPossibleWork?: boolean;
};

type ReplyThreadMessage = {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  labels: string[];
  bodyText: string;
  isUnread?: boolean;
  isResponded?: boolean;
  isAutomatic?: boolean;
  isFollowUp?: boolean;
  isPossibleWork?: boolean;
};

export type CampaignStatistic = {
  metric: string;
  count: number;
  percent: string;
  note: string;
  emphasis?: boolean;
};

export type CampaignReport = {
  dateRange?: { start?: string; end?: string };
  summary?: {
    initialEmails?: number;
    uniqueInitialContacts?: number;
    autoFollowups?: number;
    followup1Emails?: number;
    finalFollowupEmails?: number;
    realPersonResponses?: number;
  };
  stats?: CampaignStatistic[];
};

const FALLBACK_CAMPAIGN_REPORT: CampaignReport = {
  dateRange: { start: '2026-04-01', end: '2026-06-10' },
  summary: {
    initialEmails: 1334,
    uniqueInitialContacts: 667,
    autoFollowups: 2320,
    followup1Emails: 0,
    finalFollowupEmails: 0,
    realPersonResponses: 0,
  },
  stats: [
  {
    metric: 'Unique initial-outreach contacts',
    count: 667,
    percent: '100.00%',
    note: 'Unique recipient addresses from initial outreach rows only.',
    emphasis: true,
  },
  {
    metric: 'Undeliverable / bad email addresses',
    count: 179,
    percent: '26.84%',
    note: 'Unique initial-outreach addresses marked bounced or bad email.',
  },
  {
    metric: 'Wrong contact / not involved replies',
    count: 18,
    percent: '2.70%',
    note: 'Conservative Response Log scan; deduped by thread/reply.',
  },
  {
    metric: 'Contact will pass on DRS information',
    count: 47,
    percent: '7.05%',
    note: 'Contact indicated they forwarded, passed along, copied, shared, or kept DRS information on file.',
    emphasis: true,
  },
  {
    metric: 'Directed to project/procurement site',
    count: 14,
    percent: '2.10%',
    note: 'Examples include PlanetBids, BidNet, Public Purchase, and vendor/procurement portals.',
    emphasis: true,
  },
  {
    metric: 'Public agency / utility / city contacts',
    count: 87,
    percent: '13.04%',
    note: 'Recipient organization classification; private firms on public projects excluded.',
  },
  {
    metric: 'High category addresses',
    count: 188,
    percent: '28.19%',
    note: 'Unique initial-outreach addresses tied to at least one High-primary category row.',
  },
  {
    metric: 'Medium category addresses',
    count: 147,
    percent: '22.04%',
    note: 'Unique initial-outreach addresses tied to Medium-primary category rows.',
  },
  {
    metric: 'Low category addresses',
    count: 332,
    percent: '49.78%',
    note: 'Unique initial-outreach addresses whose highest referenced project category is Low.',
  },
  ],
};

function formatReportDate(value?: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function emailDateValue(value?: string) {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortEmailMessagesNewestFirst<T extends { date?: string }>(messages: T[]) {
  return [...messages].sort((a, b) => emailDateValue(b.date) - emailDateValue(a.date));
}

export function PlanHubGuyPanel({ campaignReport }: { campaignReport?: CampaignReport | null }) {
  const activeCampaignReport = campaignReport || FALLBACK_CAMPAIGN_REPORT;
  const campaignStats = activeCampaignReport.stats?.length ? activeCampaignReport.stats : FALLBACK_CAMPAIGN_REPORT.stats || [];
  const campaignSummary = activeCampaignReport.summary || FALLBACK_CAMPAIGN_REPORT.summary || {};
  const dateRange = activeCampaignReport.dateRange || FALLBACK_CAMPAIGN_REPORT.dateRange || {};
  const formattedStartDate = formatReportDate(dateRange.start);
  const formattedEndDate = formatReportDate(dateRange.end);
  const denominator = campaignSummary.uniqueInitialContacts || 0;
  const dateRangeLabel = formattedStartDate && formattedEndDate ? `${formattedStartDate}–${formattedEndDate}` : 'Campaign to date';
  const primaryStatMetrics = new Set([
    'Unique initial-outreach contacts',
    'Initial emails sent',
    'Follow-up 1 emails sent',
    'Final follow-up emails sent',
    'Total auto follow-ups sent',
    'Real person responses received',
  ]);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<'test' | 'live'>('test');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState('Idle');
  const [currentStageDetail, setCurrentStageDetail] = useState('');
  const [stageUpdatedAt, setStageUpdatedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [lastRunMessage, setLastRunMessage] = useState('');
  const [confidenceLevels, setConfidenceLevels] = useState<string[]>(['High', 'Medium', 'Low']);
  const [liveBatchLimit, setLiveBatchLimit] = useState<string>('25');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<Record<string, { subject: string; body: string }> | null>(null);
  const [replyQueue, setReplyQueue] = useState<ReplyQueueItem[]>([]);
  const [queueLabel, setQueueLabel] = useState<QueueLabel>('Possible Work');
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [selectedMessageId, setSelectedMessageId] = useState('');
  const [selectedThreadMessages, setSelectedThreadMessages] = useState<ReplyThreadMessage[]>([]);
  const [draftBody, setDraftBody] = useState('');
  const [suggestedDraftBody, setSuggestedDraftBody] = useState('');
  const [draftLoadedAt, setDraftLoadedAt] = useState('');
  const [attachmentAvailable, setAttachmentAvailable] = useState(false);
  const [attachmentConfigured, setAttachmentConfigured] = useState(false);
  const [attachmentReason, setAttachmentReason] = useState('');
  const [forceSoqAttachment, setForceSoqAttachment] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [closingMessageId, setClosingMessageId] = useState('');
  const [classifyingMessageId, setClassifyingMessageId] = useState('');
  const [classifyingLabel, setClassifyingLabel] = useState('');
  const queueRequestRef = useRef(0);
  const threadRequestRef = useRef(0);
  const draftRequestRef = useRef(0);
  const hasAmbiguousReply = currentStageDetail.toLowerCase().includes('ambiguous reply captured');

  async function load() {
    const res = await fetch('/mission-control/api/planhubguy');
    const data = await res.json();
    applyLoadedState(data);
  }

  async function loadTemplates() {
    const res = await fetch('/mission-control/api/planhubguy/templates');
    const data = await res.json();
    if (res.ok && data) {
      setTemplates(data);
      return;
    }
    setLastRunMessage('Failed to load templates.');
  }

  async function loadReplyQueue(label: QueueLabel = queueLabel, options?: { autoOpenFirst?: boolean; preferredMessageId?: string }) {
    const requestId = ++queueRequestRef.current;
    const res = await fetch(`/mission-control/api/planhubguy/reply-queue?label=${encodeURIComponent(label)}&max=50`, { cache: 'no-store' });
    const data = await res.json();
    if (requestId !== queueRequestRef.current) return;
    if (!res.ok) {
      setLastRunMessage(`Failed to load ${label} queue.`);
      return;
    }
    const items: ReplyQueueItem[] = Array.isArray(data.items) ? data.items : [];
    setReplyQueue(items);
    if (!items.length) {
      setSelectedThreadId('');
      setSelectedMessageId('');
      setSelectedThreadMessages([]);
      setDraftBody('');
      setSuggestedDraftBody('');
      setForceSoqAttachment(false);
      return;
    }
    if (options?.autoOpenFirst === false) return;
    const preferred = (options?.preferredMessageId ? items.find((item) => item.id === options.preferredMessageId) : undefined) || items[0];
    if (!preferred) return;
    if (preferred.threadId !== selectedThreadId || preferred.id !== selectedMessageId) {
      await openReplyThread(preferred.threadId, preferred.id);
    }
  }

  async function loadDraftForMessage(threadId: string, messageId: string) {
    const requestId = ++draftRequestRef.current;
    const res = await fetch('/mission-control/api/planhubguy/reply-draft', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, messageId }),
    });
    const data = await res.json();
    if (requestId !== draftRequestRef.current) return;
    if (!res.ok) {
      setLastRunMessage(`Draft generation failed: ${data.error || 'unknown error'}`);
      return;
    }
    const nextBody = String(data.body || '');
    setDraftBody(nextBody);
    setSuggestedDraftBody(nextBody);
    setDraftLoadedAt(new Date().toLocaleTimeString());
    setForceSoqAttachment(false);
    setAttachmentAvailable(Boolean(data.attachmentAvailable));
    setAttachmentConfigured(Boolean(data.attachmentConfigured));
    setAttachmentReason(String(data.attachmentReason || ''));
    setLastRunMessage(nextBody ? 'Suggested reply loaded.' : 'No suggested reply text was returned.');
  }

  async function openReplyThread(threadId: string, messageId: string) {
    const requestId = ++threadRequestRef.current;
    const res = await fetch(`/mission-control/api/planhubguy/reply-queue/${encodeURIComponent(threadId)}?messageId=${encodeURIComponent(messageId)}`, { cache: 'no-store' });
    const data = await res.json();
    if (requestId !== threadRequestRef.current) return;
    if (!res.ok) {
      setLastRunMessage('Failed to open email thread.');
      return;
    }
    const nextSelectedMessageId = data.selected?.id || messageId;
    const nextMessages: ReplyThreadMessage[] = sortEmailMessagesNewestFirst(Array.isArray(data.messages) ? data.messages : []);
    const nextSelectedMessage = nextMessages.find((message: ReplyThreadMessage) => message.id === nextSelectedMessageId) || nextMessages[0];
    setSelectedThreadId(threadId);
    setSelectedMessageId(nextSelectedMessageId);
    setSelectedThreadMessages(nextMessages);
    setDraftBody('');
    setSuggestedDraftBody('');
    setForceSoqAttachment(false);
    setAttachmentAvailable(Boolean(data.soqAttachmentAvailable));
    setAttachmentConfigured(Boolean(data.soqAttachmentAvailable));
    setAttachmentReason(Boolean(data.soqAttachmentAvailable) ? 'SOQ is configured on this machine.' : 'SOQ attachment is not configured on this machine yet.');
    if (nextSelectedMessage) {
      await loadDraftForMessage(threadId, nextSelectedMessageId);
    }
  }

  async function generateReplyDraft() {
    if (!selectedThreadId || !selectedMessageId) return;
    await loadDraftForMessage(selectedThreadId, selectedMessageId);
  }

  async function sendReply() {
    if (isSendingReply) return;
    if (!selectedThreadId || !selectedMessageId) {
      setLastRunMessage('Cannot send reply: no email is actively selected. Please reopen the email from the queue and try again.');
      return;
    }
    if (!draftBody.trim()) {
      setLastRunMessage('Cannot send reply: the draft is empty. Please reload the suggested reply and try again.');
      return;
    }
    const sentThreadId = selectedThreadId;
    const sentMessageId = selectedMessageId;
    const sentDraftBody = draftBody;
    const sentSuggestedDraftBody = suggestedDraftBody;
    const sentForceSoqAttachment = forceSoqAttachment;
    const previousQueue = replyQueue;
    const previousThreadId = selectedThreadId;
    const previousMessageId = selectedMessageId;
    const previousThreadMessages = selectedThreadMessages;
    const previousAttachmentAvailable = attachmentAvailable;
    const previousAttachmentConfigured = attachmentConfigured;
    const previousAttachmentReason = attachmentReason;
    const previousForceSoqAttachment = forceSoqAttachment;

    setIsSendingReply(true);
    setLastRunMessage('Sending reply…');

    try {
      const res = await fetch('/mission-control/api/planhubguy/reply-send', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: sentThreadId, messageId: sentMessageId, body: sentDraftBody, suggestedBody: sentSuggestedDraftBody, forceSoq: sentForceSoqAttachment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReplyQueue(previousQueue);
        setSelectedThreadId(previousThreadId);
        setSelectedMessageId(previousMessageId);
        setSelectedThreadMessages(previousThreadMessages);
        setAttachmentAvailable(previousAttachmentAvailable);
        setAttachmentConfigured(previousAttachmentConfigured);
        setAttachmentReason(previousAttachmentReason);
        setForceSoqAttachment(previousForceSoqAttachment);
        setDraftBody(sentDraftBody);
        setSuggestedDraftBody(sentSuggestedDraftBody);
        setLastRunMessage(`Reply send failed: ${data.error || 'unknown error'}`);
        return;
      }

      const respondedIds = new Set<string>(Array.isArray(data.respondedMessageIds) ? data.respondedMessageIds : [sentMessageId]);
      const confirmedNextItems = previousQueue.filter((item) => !respondedIds.has(item.id));
      const confirmedNextItem = confirmedNextItems[0];
      queueRequestRef.current += 1;
      threadRequestRef.current += 1;
      draftRequestRef.current += 1;
      setIsSendingReply(false);
      setReplyQueue(confirmedNextItems);
      setDraftBody('');
      setSuggestedDraftBody('');
      setForceSoqAttachment(false);
      if (!confirmedNextItem) {
        setSelectedThreadId('');
        setSelectedMessageId('');
        setSelectedThreadMessages([]);
        setAttachmentAvailable(false);
        setAttachmentConfigured(false);
        setAttachmentReason('');
      } else {
        setSelectedThreadId(confirmedNextItem.threadId);
        setSelectedMessageId(confirmedNextItem.id);
        setSelectedThreadMessages([]);
        setAttachmentAvailable(false);
        setAttachmentConfigured(false);
        setAttachmentReason('');
        void openReplyThread(confirmedNextItem.threadId, confirmedNextItem.id);
      }
      setLastRunMessage(`Reply sent${data.attachmentIncluded ? ' with SOQ attached' : ''}.`);
    } catch (error: any) {
      setReplyQueue(previousQueue);
      setSelectedThreadId(previousThreadId);
      setSelectedMessageId(previousMessageId);
      setSelectedThreadMessages(previousThreadMessages);
      setAttachmentAvailable(previousAttachmentAvailable);
      setAttachmentConfigured(previousAttachmentConfigured);
      setAttachmentReason(previousAttachmentReason);
      setForceSoqAttachment(previousForceSoqAttachment);
      setDraftBody(sentDraftBody);
      setSuggestedDraftBody(sentSuggestedDraftBody);
      setLastRunMessage(`Reply send failed: ${error?.message || 'network error'}`);
    } finally {
      setIsSendingReply(false);
    }
  }

  function flashCloseButton(event: { currentTarget: HTMLButtonElement }) {
    event.currentTarget.classList.add('planhub-clicked-button', 'planhub-closing-button');
    event.currentTarget.textContent = 'CLICKED — Closing…';
  }

  function flashClassifyButton(event: { currentTarget: HTMLButtonElement }, label: string) {
    event.currentTarget.classList.add('planhub-clicked-button', 'planhub-closing-button');
    event.currentTarget.textContent = `CLICKED — Marking ${label}…`;
  }

  async function classifySelectedMessage(label: QueueLabel | 'Automatic Reply' | 'Ignored' | 'Responded', threadIdOverride = '', messageIdOverride = '') {
    const activeMessageId = messageIdOverride || selectedMessageId;
    const activeThreadId = threadIdOverride || selectedThreadId;
    if (!activeMessageId) return;
    const activeQueueLabel = queueLabel;
    const closingThreadId = activeThreadId;
    const closingMessageId = activeMessageId;
    const previousQueue = replyQueue;
    const previousThreadMessages = selectedThreadMessages;

    if (label === 'Responded') {
      setClosingMessageId(closingMessageId);
      queueRequestRef.current += 1;
      threadRequestRef.current += 1;
      draftRequestRef.current += 1;
      setLastRunMessage('Closing email in Gmail…');

      const closeRequest = fetch('/mission-control/api/planhubguy/reply-classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: closingThreadId, messageId: closingMessageId, label }),
      });

      await new Promise((resolve) => setTimeout(resolve, 850));
      setReplyQueue((items) => items.filter((item) => item.id !== closingMessageId && item.threadId !== closingThreadId));
      setSelectedThreadId('');
      setSelectedMessageId('');
      setSelectedThreadMessages([]);
      setDraftBody('');
      setSuggestedDraftBody('');
      setAttachmentAvailable(false);
      setAttachmentConfigured(false);
      setAttachmentReason('');
      setForceSoqAttachment(false);
      setClosingMessageId('');
      setLastRunMessage('Closed locally. Finishing Gmail labels…');

      try {
        const res = await closeRequest;
        const data = await res.json();
        if (!res.ok) {
          setLastRunMessage(`Close failed: ${data.error || 'unknown error'}`);
          setReplyQueue(previousQueue);
          setSelectedThreadId(closingThreadId);
          setSelectedMessageId(closingMessageId);
          setSelectedThreadMessages(previousThreadMessages);
          return;
        }
        setLastRunMessage('Closed without replying.');
      } catch (error: any) {
        setLastRunMessage(`Close failed: ${error?.message || 'network error'}`);
        setReplyQueue(previousQueue);
        setSelectedThreadId(closingThreadId);
        setSelectedMessageId(closingMessageId);
        setSelectedThreadMessages(previousThreadMessages);
      }
      return;
    }

    setClassifyingMessageId(closingMessageId);
    setClassifyingLabel(label);
    setLastRunMessage(`Marking email ${label}…`);
    const classifyRequest = fetch('/mission-control/api/planhubguy/reply-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: closingThreadId, messageId: closingMessageId, label }),
    });

    await new Promise((resolve) => setTimeout(resolve, 850));
    setReplyQueue((items) => items.filter((item) => item.id !== closingMessageId && item.threadId !== closingThreadId));
    if (selectedMessageId === closingMessageId) {
      setSelectedThreadId('');
      setSelectedMessageId('');
      setSelectedThreadMessages([]);
      setDraftBody('');
      setSuggestedDraftBody('');
      setAttachmentAvailable(false);
      setAttachmentConfigured(false);
      setAttachmentReason('');
      setForceSoqAttachment(false);
    }

    try {
      const res = await classifyRequest;
      const data = await res.json();
      if (!res.ok) {
        setReplyQueue(previousQueue);
        setSelectedThreadId(closingThreadId);
        setSelectedMessageId(closingMessageId);
        setSelectedThreadMessages(previousThreadMessages);
        setLastRunMessage(`Classification failed: ${data.error || 'unknown error'}`);
        setClassifyingMessageId('');
        setClassifyingLabel('');
        return;
      }
    } catch (error: any) {
      setReplyQueue(previousQueue);
      setSelectedThreadId(closingThreadId);
      setSelectedMessageId(closingMessageId);
      setSelectedThreadMessages(previousThreadMessages);
      setLastRunMessage(`Classification failed: ${error?.message || 'network error'}`);
      setClassifyingMessageId('');
      setClassifyingLabel('');
      return;
    }
    setLastRunMessage(`Message labeled ${label}.`);
    setClassifyingMessageId('');
    setClassifyingLabel('');
    await loadReplyQueue(activeQueueLabel, { autoOpenFirst: false });
  }

  useEffect(() => {
    void load();
    void loadReplyQueue('Possible Work');
  }, []);

  useEffect(() => {
    void loadReplyQueue(queueLabel);
  }, [queueLabel]);

  useEffect(() => {
    if (templatesOpen && !templates) {
      void loadTemplates();
    }
  }, [templatesOpen, templates]);

  function applyLoadedState(data: any) {
    setEnabled(Boolean(data.enabled));
    setMode(data.mode === 'live' ? 'live' : 'test');
    setUpdatedAt(data.updatedAt || null);
    setCurrentStage(data.currentStage || 'Idle');
    setCurrentStageDetail(data.currentStageDetail || '');
    setStageUpdatedAt(data.stageUpdatedAt || null);
    setConfidenceLevels(Array.isArray(data.confidenceLevels) ? data.confidenceLevels : ['High', 'Medium', 'Low']);
    setLiveBatchLimit(String(data.liveBatchLimit ?? 25));
  }

  function saveState(next: { enabled?: boolean; mode?: 'test' | 'live'; liveBatchLimit?: number }) {
    startTransition(async () => {
      const res = await fetch('/mission-control/api/planhubguy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      applyLoadedState(data);
    });
  }

  function addSoqSentenceAndAttachment() {
    const sentence = 'Please find attached our Statement of Qualifications for your information.';
    const hasSoqSentence = /statement of qualifications|\bSOQ\b/i.test(draftBody);
    const trimmed = draftBody.trimEnd();
    const signoffMatch = trimmed.match(/\n\s*(thanks|thank you|regards|best regards)\s*,?\s*$/i);
    const nextBody = hasSoqSentence
      ? draftBody
      : signoffMatch
        ? `${trimmed.slice(0, signoffMatch.index).trimEnd()}\n\n${sentence}\n${signoffMatch[0].trimStart()}`
        : `${trimmed}${trimmed ? '\n\n' : ''}${sentence}`;
    setDraftBody(nextBody);
    setForceSoqAttachment(true);
    setAttachmentAvailable(true);
    setAttachmentConfigured(true);
    setAttachmentReason('SOQ will be attached when this reply is sent.');
  }

  function compactThreadBody(value: string) {
    const text = (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const cutPatterns = [
      /\nOn [\s\S]+?wrote:\s*/i,
      /\nFrom:\s*[\s\S]+/i,
      /\n[-_]{2,}\s*Original Message\s*[-_]{2,}/i,
      /\n________________________________\s*$/i,
    ];
    let next = text;
    for (const pattern of cutPatterns) {
      const match = next.match(pattern);
      if (match?.index && match.index > 60) {
        next = next.slice(0, match.index).trim();
      }
    }
    next = next.replace(/\n{3,}/g, '\n\n').trim();
    return next || text;
  }

  const selectedMessage = selectedThreadMessages.find((message) => message.id === selectedMessageId) || selectedThreadMessages[0];
  const selectedClosing = Boolean(selectedMessageId && closingMessageId === selectedMessageId);
  const selectedClassifying = Boolean(selectedMessageId && classifyingMessageId === selectedMessageId);
  const duplicateOutboundGroups = Array.from(selectedThreadMessages.reduce((groups, message) => {
    const fromEmail = (message.fromEmail || '').toLowerCase();
    const subjectKey = (message.subject || '').toLowerCase().replace(/^(re|fw|fwd):\s*/g, '').replace(/\s+/g, ' ').trim();
    const isPlanHubOutbound = fromEmail.endsWith('@drs-engineering.net') && /^(regarding |final follow-up|re: )/i.test(message.subject || '');
    if (!isPlanHubOutbound || !subjectKey) return groups;
    const current = groups.get(subjectKey) || [];
    current.push(message);
    groups.set(subjectKey, current);
    return groups;
  }, new Map<string, ReplyThreadMessage[]>()).values()).filter((messages) => messages.length > 1);
  const showThreadHistory = duplicateOutboundGroups.length > 0 && selectedThreadMessages.length > 1;

  return (
    <main className="grid planhub-page" style={{ gap: 16 }}>

      <section className="grid">
        <section className="card">
          <div className="section-title">
            <div>
              <h2>Status</h2>
              <p className="muted small">Current operational state.</p>
            </div>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <div className="item">
              <div className="item-top">
                <div>
                  <h3>{enabled ? 'Enabled' : 'Paused'}</h3>
                  <p className="muted small">{enabled ? 'PlanHubGuy is allowed to run the workflow.' : 'PlanHubGuy is currently paused.'}</p>
                </div>
                <span className={`status-pill ${enabled ? 'active' : 'priority-low'}`}>{enabled ? 'Running' : 'Stopped'}</span>
              </div>
              <p className="muted small">Mode: <strong>{mode === 'live' ? 'Live (real recipients)' : 'Test (internal DRS samples only)'}</strong></p>
              <p className="muted small">Last changed: {updatedAt ?? 'not set yet'}</p>
            </div>
            <div className="clawhub-actions">
              <button className="reference-primary-button planhub-start-button" type="button" disabled={isPending || enabled} onClick={() => saveState({ enabled: true })}>
                {isPending && !enabled ? 'Starting…' : 'Start'}
              </button>
              <button className="mission-nav-link clawhub-button planhub-stop-button" type="button" disabled={isPending || !enabled} onClick={() => saveState({ enabled: false })}>
                {isPending && enabled ? 'Stopping…' : 'Stop'}
              </button>
              {/* Dev/Prod toggles removed per request */}
              <button
                className="reference-primary-button"
                type="button"
                disabled={isPending}
                onClick={() => startTransition(async () => {
                  let runState = enabled;
                  if (!enabled) {
                    const enableRes = await fetch('/mission-control/api/planhubguy', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: true }),
                    });
                    const enableData = await enableRes.json();
                    applyLoadedState(enableData);
                    runState = Boolean(enableData.enabled);
                  }
                  if (!runState) {
                    setLastRunMessage('Manual run failed: PlanHubGuy could not be enabled.');
                    return;
                  }
                  setCurrentStage('Manual run in progress');
                  setCurrentStageDetail('PlanHubGuy is executing a manual run now.');
                  setStageUpdatedAt(new Date().toISOString());
                  const res = await fetch('/mission-control/api/planhubguy/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ manual: true }),
                  });
                  const data = await res.json();
                  await load();
                  setLastRunMessage(res.ok ? 'Manual live run started and completed.' : `Manual run failed: ${data.error || 'unknown error'}`);
                })}
              >
                Run now
              </button>
            </div>
            {lastRunMessage ? <p className="muted small">{lastRunMessage}</p> : null}
          </div>
        </section>

      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Process stage</h2>
            <p className="muted small">Where PlanHubGuy is in the workflow right now.</p>
          </div>
        </div>
        <div className="item">
          <div className="item-top">
            <div>
              <h3>{currentStage || (enabled ? 'Waiting for next run' : 'Idle')}</h3>
              <p className="muted small">{currentStageDetail || (enabled ? 'PlanHubGuy is enabled and waiting for the next scheduled or manual run. External sending does not begin before the send window.' : 'No active detail right now.')}</p>
            </div>
            <span className={`status-pill ${enabled ? 'active' : 'priority-low'}`}>{enabled ? 'Enabled' : 'Idle'}</span>
          </div>
          <p className="muted small">Stage updated: {stageUpdatedAt ?? (enabled ? 'awaiting first recorded stage' : 'not set yet')}</p>
          {hasAmbiguousReply ? (
            <div className="item" style={{ marginTop: 12, borderColor: 'rgba(245, 158, 11, 0.45)', background: 'rgba(245, 158, 11, 0.08)' }}>
              <div className="item-top">
                <div>
                  <h3>Reply captured, attribution needs review</h3>
                  <p className="muted small">A real inbound reply was preserved, but PlanHubGuy was not confident enough to update Outreach state automatically.</p>
                </div>
                <span className="status-pill priority-medium">Review</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Excavation confidence filter</h2>
            <p className="muted small">Choose which excavation-confidence levels are eligible for outreach.</p>
          </div>
        </div>
        <div className="clawhub-actions" style={{ gap: 12, flexWrap: 'wrap' }}>
          {['High', 'Medium', 'Low'].map((level) => (
            <label key={level} className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={confidenceLevels.includes(level)}
                onChange={(e) => {
                  const next = e.target.checked ? [...confidenceLevels, level] : confidenceLevels.filter((item) => item !== level);
                  setConfidenceLevels(next);
                }}
              />
              {level}
            </label>
          ))}
          <button
            className="reference-primary-button"
            type="button"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const res = await fetch('/mission-control/api/planhubguy/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confidenceLevels }),
              });
              const data = await res.json();
              setLastRunMessage(res.ok ? `Saved confidence filter: ${(data.confidenceLevels || []).join(', ')}` : 'Failed to save confidence filter.');
            })}
          >
            Save confidence filter
          </button>
        </div>
        <div className="grid" style={{ gap: 10, marginTop: 16 }}>
          <label className="muted small" style={{ display: 'grid', gap: 6, maxWidth: 260 }}>
            <span>Live batch limit</span>
            <input
              type="number"
              min="1"
              value={liveBatchLimit}
              onChange={(e) => setLiveBatchLimit(e.target.value)}
              style={{ padding: '8px 10px' }}
            />
          </label>
          <div className="clawhub-actions">
            <button
              className="reference-primary-button"
              type="button"
              disabled={isPending}
              onClick={() => {
                const parsed = Number(liveBatchLimit);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                  setLastRunMessage('Live batch limit must be a positive number.');
                  return;
                }
                saveState({ liveBatchLimit: parsed });
              }}
            >
              Save live batch limit
            </button>
            <p className="muted small">Current live run cap for scheduled/manual live sends.</p>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Inbound review & reply queue</h2>
            <p className="muted small">Possible Work and Follow up queues are refreshed automatically from inbox/spam review.</p>
          </div>
        </div>
        <div className="grid" style={{ alignItems: 'start', gap: 16, gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 2.4fr)' }}>
          <section className="item" style={{ gap: 12, display: 'grid' }}>
            <div className="clawhub-actions" style={{ flexWrap: 'wrap' }}>
              <button
                className={`mission-nav-link clawhub-button ${queueLabel === 'Possible Work' ? 'planhub-start-button' : ''}`}
                type="button"
                onClick={() => setQueueLabel('Possible Work')}
              >
                Possible Work queue
              </button>
              <button
                className={`mission-nav-link clawhub-button ${queueLabel === 'Follow up' ? 'planhub-start-button' : ''}`}
                type="button"
                onClick={() => setQueueLabel('Follow up')}
              >
                Follow up queue
              </button>
            </div>
            <div className="item">
              <div className="item-top">
                <div>
                  <h3>{queueLabel}</h3>
                  <p className="muted small">Compact queue. Open a number to review it.</p>
                </div>
                <span className="status-pill priority-medium">{replyQueue.length}</span>
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 520, overflow: 'auto', marginTop: 12 }}>
                {replyQueue.length ? replyQueue.map((item, index) => (
                  <button
                    key={`${item.threadId}:${item.id}`}
                    type="button"
                    onClick={() => void openReplyThread(item.threadId, item.id)}
                    style={{
                      textAlign: 'left',
                      padding: '9px 10px',
                      borderRadius: 10,
                      border: selectedMessageId === item.id ? '1px solid rgba(59,130,246,0.75)' : '1px solid rgba(148,163,184,0.32)',
                      background: selectedMessageId === item.id ? 'rgba(191,219,254,0.92)' : 'rgba(241,245,249,0.88)',
                      color: '#0f172a',
                      cursor: 'pointer'
                    }}
                  >
                    <strong>{index + 1}.</strong> {item.fromEmail || item.from}
                  </button>
                )) : <p className="muted small">No emails in this queue right now.</p>}
              </div>
            </div>
          </section>

          <section className="item" style={{ gap: 14, display: 'grid', minHeight: 680 }}>
            <div className="section-title">
              <div>
                <h3>Email viewer</h3>
                <p className="muted small">Shows the contact response first, with the suggested reply directly below it.</p>
              </div>
            </div>
            {selectedMessage ? (
              <>
                <div className="item" style={{ minHeight: 260 }}>
                  <div className="item-top">
                    <div>
                      <h3>{selectedMessage.fromEmail || selectedMessage.from}</h3>
                      <p className="muted small">{selectedMessage.subject}</p>
                    </div>
                    <span className="status-pill">#{Math.max(1, replyQueue.findIndex((item) => item.id === selectedMessage.id) + 1)}</span>
                  </div>
                  <div className="clawhub-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                    <button className={`mission-nav-link clawhub-button ${selectedClassifying && classifyingLabel === 'Possible Work' ? 'planhub-closing-button' : ''}`} type="button" disabled={selectedClassifying || selectedMessage.isPossibleWork} onPointerDown={(event) => { flashClassifyButton(event, 'possible work'); void classifySelectedMessage('Possible Work', selectedMessage.threadId, selectedMessage.id); }} onClick={(event) => { event.preventDefault(); }}>
                      {selectedClassifying && classifyingLabel === 'Possible Work' ? 'CLICKED — Marking possible work…' : 'Mark possible work'}
                    </button>
                    <button className={`mission-nav-link clawhub-button ${selectedClassifying && classifyingLabel === 'Follow up' ? 'planhub-closing-button' : ''}`} type="button" disabled={selectedClassifying || selectedMessage.isFollowUp} onPointerDown={(event) => { flashClassifyButton(event, 'follow up'); void classifySelectedMessage('Follow up', selectedMessage.threadId, selectedMessage.id); }} onClick={(event) => { event.preventDefault(); }}>
                      {selectedClassifying && classifyingLabel === 'Follow up' ? 'CLICKED — Marking follow up…' : 'Mark follow up'}
                    </button>
                    <button className={`mission-nav-link clawhub-button ${selectedClassifying && classifyingLabel === 'Automatic Reply' ? 'planhub-closing-button' : ''}`} type="button" disabled={selectedClassifying || selectedMessage.isAutomatic} onPointerDown={(event) => { flashClassifyButton(event, 'automatic'); void classifySelectedMessage('Automatic Reply', selectedMessage.threadId, selectedMessage.id); }} onClick={(event) => { event.preventDefault(); }}>
                      {selectedClassifying && classifyingLabel === 'Automatic Reply' ? 'CLICKED — Marking automatic…' : 'Mark automatic'}
                    </button>
                    <button className={`mission-nav-link clawhub-button ${closingMessageId === selectedMessage.id ? 'planhub-closing-button' : ''}`} type="button" disabled={selectedClosing || selectedMessage.isResponded} onPointerDown={(event) => { flashCloseButton(event); void classifySelectedMessage('Responded', selectedMessage.threadId, selectedMessage.id); }} onClick={(event) => { event.preventDefault(); }}>
                      {closingMessageId === selectedMessage.id ? 'CLICKED — Closing…' : 'Mark responded / close'}
                    </button>
                  </div>
                  <p className="muted small" style={{ marginTop: 10 }}>{selectedMessage.date}</p>
                  {duplicateOutboundGroups.length ? (
                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(220,38,38,0.5)', background: 'rgba(254,226,226,0.95)', color: '#7f1d1d' }}>
                      <strong>Possible duplicate outreach detected in this thread.</strong>
                      {duplicateOutboundGroups.map((group) => (
                        <p key={group[0].subject} style={{ margin: '6px 0 0 0' }}>
                          {group.length} DRS/PlanHubGuy messages with subject “{group[0].subject}” were found in this conversation.
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {showThreadHistory ? (
                    <div style={{ marginTop: 12, padding: '12px', borderRadius: 12, border: '1px solid rgba(59,130,246,0.28)', background: 'rgba(239,246,255,0.95)' }}>
                      <div className="item-top" style={{ marginBottom: 10 }}>
                        <div>
                          <h3 style={{ margin: 0 }}>Full email chain</h3>
                          <p className="muted small">Clean view of what has already been sent and received in this thread.</p>
                        </div>
                        <span className="status-pill">{selectedThreadMessages.length} messages</span>
                      </div>
                      <div style={{ display: 'grid', gap: 10, maxHeight: 520, overflow: 'auto', paddingRight: 4 }}>
                        {selectedThreadMessages.map((message, index) => {
                          const isDrsMessage = (message.fromEmail || '').toLowerCase().endsWith('@drs-engineering.net');
                          const isCurrent = message.id === selectedMessage.id;
                          return (
                            <article key={message.id} style={{ borderRadius: 12, border: isCurrent ? '2px solid rgba(37,99,235,0.55)' : '1px solid rgba(148,163,184,0.34)', background: isDrsMessage ? 'rgba(255,255,255,0.96)' : 'rgba(240,253,244,0.94)', padding: '10px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                                <div>
                                  <strong>{index + 1}. {isDrsMessage ? 'DRS / PlanHubGuy' : (message.fromEmail || message.from)}</strong>
                                  <p className="muted small" style={{ marginTop: 3 }}>{message.date}</p>
                                  <p className="muted small" style={{ marginTop: 3 }}>{message.subject}</p>
                                </div>
                                <span className="status-pill">{isCurrent ? 'Current' : isDrsMessage ? 'Sent' : 'Received'}</span>
                              </div>
                              <div style={{ whiteSpace: 'pre-wrap', color: '#123c5e', fontSize: '0.9rem', lineHeight: 1.45 }}>{compactThreadBody(message.bodyText)}</div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 14, minHeight: 260, maxHeight: 420, overflow: 'auto', fontSize: '1rem', lineHeight: 1.5 }}>{selectedMessage.bodyText}</div>
                </div>
                <div className="item">
                  <div className="clawhub-actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                    <button className="reference-primary-button" type="button" disabled={isPending} onClick={() => startTransition(async () => { await generateReplyDraft(); })}>
                      Reload suggested reply
                    </button>
                    <button className="mission-nav-link clawhub-button" type="button" disabled={!selectedMessageId} onClick={addSoqSentenceAndAttachment}>
                      Add SOQ sentence + attachment
                    </button>
                  </div>
                  <label className="muted small" style={{ display: 'grid', gap: 8 }}>
                    <span>Suggested reply{draftLoadedAt ? ` — regenerated ${draftLoadedAt}` : ''}</span>
                    <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={16} style={{ width: '100%', padding: '12px' }} placeholder="Suggested reply will appear here automatically for the selected follow-up email." />
                  </label>
                  <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                    <div className="clawhub-actions" style={{ flexWrap: 'wrap' }}>
                      <button className="reference-primary-button planhub-start-button" type="button" disabled={isSendingReply || !selectedThreadId || !selectedMessageId || !draftBody.trim()} onClick={() => { void sendReply(); }}>
                        {isSendingReply ? 'Sending…' : 'Send reply now'}
                      </button>
                      <button className={`mission-nav-link clawhub-button ${selectedClosing ? 'planhub-closing-button' : ''}`} type="button" disabled={selectedClosing || !selectedMessage} onPointerDown={(event) => { if (!selectedMessage) return; flashCloseButton(event); void classifySelectedMessage('Responded', selectedMessage.threadId, selectedMessage.id); }} onClick={(event) => { event.preventDefault(); }}>
                        {selectedClosing ? 'CLICKED — Closing…' : 'Close without replying'}
                      </button>
                    </div>
                    <p className="muted small">When sent, this item is relabeled to Responded and drops out of the queue. Close without replying marks it Responded without sending anything.</p>
                  </div>
                  <p className="muted small" style={{ marginTop: 10 }}>
                    {forceSoqAttachment
                      ? 'SOQ attachment will be included when sent.'
                      : attachmentAvailable
                        ? 'SOQ attachment is available and will be included when sent.'
                        : attachmentConfigured
                          ? (attachmentReason || 'SOQ is configured, but this reply will not include it.')
                          : 'SOQ attachment is not configured on this machine yet, so sends go out without it.'}
                  </p>
                </div>
              </>
            ) : <p className="muted small">Open an email from the queue to review it here.</p>}
          </section>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Templates</h2>
            <p className="muted small">Open and edit PlanHubGuy templates without leaving this page.</p>
          </div>
          <button className="mission-nav-link clawhub-button" type="button" onClick={() => setTemplatesOpen((v) => !v)}>
            {templatesOpen ? 'Hide templates' : 'Open templates'}
          </button>
        </div>
        {templatesOpen ? (
          templates ? <PlanHubGuyTemplatesEditor initialTemplates={templates} /> : <p className="muted small">Loading templates…</p>
        ) : null}
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Logs</h2>
            <p className="muted small">Quick links to PlanHubGuy logs.</p>
          </div>
        </div>
        <div className="clawhub-actions" style={{ gap: 10, flexWrap: 'wrap' }}>
          <a className="mission-nav-link clawhub-button" href="https://docs.google.com/spreadsheets/d/1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s/edit#gid=2080954848" target="_blank" rel="noreferrer">Test Log</a>
          <a className="mission-nav-link clawhub-button" href="https://docs.google.com/spreadsheets/d/1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s/edit#gid=2085353928" target="_blank" rel="noreferrer">Outreach Log</a>
          <a className="mission-nav-link clawhub-button" href="https://docs.google.com/spreadsheets/d/1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s/edit#gid=702983069" target="_blank" rel="noreferrer">Response Log</a>
        </div>
      </section>

      <section className="card planhub-stats-card">
        <div className="section-title planhub-stats-heading">
          <div>
            <p className="eyebrow">Marketing statistics</p>
            <h2>PlanHubGuy email campaign</h2>
            <p className="muted small">{dateRangeLabel} · one consolidated view; percentages use {denominator.toLocaleString()} unique initial-outreach contacts where applicable.</p>
          </div>
        </div>
        <div className="planhub-stats-table-wrap">
          <table className="planhub-stats-table">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Count</th>
                <th scope="col">Rate</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {campaignStats.map((stat) => (
                <tr key={stat.metric} className={`${primaryStatMetrics.has(stat.metric) ? 'is-primary' : ''} ${stat.emphasis ? 'is-emphasis' : ''}`.trim() || undefined}>
                  <th scope="row">{stat.metric}</th>
                  <td><span className="planhub-stat-count">{stat.count.toLocaleString()}</span></td>
                  <td>{stat.percent}</td>
                  <td>{stat.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </main>
  );
}
