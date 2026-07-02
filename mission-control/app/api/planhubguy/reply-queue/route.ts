import { NextRequest, NextResponse } from 'next/server';
import { getQueueSnapshots, readState } from '../queue-state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedLabel = searchParams.get('label');
    const label = requestedLabel === 'Automatic Reply' ? 'Automatic Reply' : requestedLabel === 'Possible Work' ? 'Possible Work' : 'Follow up';
    const state = await readState();
    const snapshots = getQueueSnapshots(state);
    return NextResponse.json({
      items: snapshots[label],
      label,
      snapshotUpdatedAt: state.replyQueueSnapshotsUpdatedAt || null,
      mode: 'snapshot',
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'reply queue failed' }, { status: 500 });
  }
}
