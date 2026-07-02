import { promises as fs } from 'fs';
import path from 'path';

export const stateFile = '/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json';
export const queueLabels = ['Possible Work', 'Follow up', 'Automatic Reply'] as const;
export type QueueLabel = typeof queueLabels[number];

type QueueItem = Record<string, any>;
type QueueSnapshotMap = Record<QueueLabel, QueueItem[]>;

const defaultState = {
  enabled: false,
  mode: 'test',
  updatedAt: null,
  seenInboundThreads: [],
  confidenceLevels: ['High', 'Medium', 'Low'],
  currentStage: 'Idle',
  currentStageDetail: '',
  stageUpdatedAt: null,
};

export async function readState() {
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { ...defaultState };
  }
}

export async function writeState(state: any) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const tempFile = `${stateFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await fs.rename(tempFile, stateFile);
}

export function getQueueSnapshots(state: any): QueueSnapshotMap {
  const saved = state?.replyQueueSnapshots || {};
  return {
    'Possible Work': Array.isArray(saved['Possible Work']) ? saved['Possible Work'] : [],
    'Follow up': Array.isArray(saved['Follow up']) ? saved['Follow up'] : [],
    'Automatic Reply': Array.isArray(saved['Automatic Reply']) ? saved['Automatic Reply'] : [],
  };
}

export async function setQueueSnapshot(label: QueueLabel, items: QueueItem[]) {
  const state = await readState();
  const snapshots = getQueueSnapshots(state);
  snapshots[label] = Array.isArray(items) ? items : [];
  state.replyQueueSnapshots = snapshots;
  state.replyQueueSnapshotsUpdatedAt = new Date().toISOString();
  await writeState(state);
  return state;
}

export async function setAllQueueSnapshots(next: Partial<QueueSnapshotMap>) {
  const state = await readState();
  const snapshots = getQueueSnapshots(state);
  for (const label of queueLabels) {
    if (label in next) snapshots[label] = Array.isArray(next[label]) ? next[label]! : [];
  }
  state.replyQueueSnapshots = snapshots;
  state.replyQueueSnapshotsUpdatedAt = new Date().toISOString();
  await writeState(state);
  return state;
}

export async function removeMessagesFromSnapshots(messageIds: string[], threadIds: string[] = []) {
  const ids = new Set((messageIds || []).filter(Boolean));
  const threads = new Set((threadIds || []).filter(Boolean));
  if (!ids.size && !threads.size) return readState();
  const state = await readState();
  const snapshots = getQueueSnapshots(state);
  for (const label of queueLabels) {
    snapshots[label] = snapshots[label].filter((item) => {
      const itemId = String(item?.id || '');
      const itemThreadId = String(item?.threadId || '');
      return !ids.has(itemId) && !threads.has(itemThreadId);
    });
  }
  state.replyQueueSnapshots = snapshots;
  state.replyQueueSnapshotsUpdatedAt = new Date().toISOString();
  await writeState(state);
  return state;
}

export async function removeMessageIdsFromSnapshots(messageIds: string[]) {
  return removeMessagesFromSnapshots(messageIds);
}
