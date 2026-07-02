#!/usr/bin/env python3
"""Clean PlanHubGuy Follow up queue entries that already have a later internal reply.

This is deliberately conservative: it only marks an external Follow up item as
Responded when the same Gmail thread contains an internal/SENT message dated
after the selected external message.
"""
import json
import importlib.util
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).resolve().parent
RUNNER_PATH = SCRIPT_DIR / 'planhubguy-runner.py'
REVIEW_PATH = SCRIPT_DIR / 'planhubguy-review.py'
STATE_PATH = Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json')
OUT_PATH = SCRIPT_DIR / 'tmp' / 'planhubguy-followup-clean-replied-summary.json'


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Unable to load {path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[attr-defined]
    return module


runner = load_module('planhubguy_runner', RUNNER_PATH)
review = load_module('planhubguy_review', REVIEW_PATH)


def clean_state_snapshots(message_ids, thread_ids):
    if not STATE_PATH.exists():
        return 0
    state = json.loads(STATE_PATH.read_text())
    snapshots = state.get('replyQueueSnapshots') or {}
    removed = 0
    for label, items in list(snapshots.items()):
        kept = []
        for item in items or []:
            if str(item.get('id', '')) in message_ids or str(item.get('threadId', '')) in thread_ids:
                removed += 1
            else:
                kept.append(item)
        snapshots[label] = kept
    state['replyQueueSnapshots'] = snapshots
    state['replyQueueSnapshotsUpdatedAt'] = datetime.now().isoformat()
    STATE_PATH.write_text(json.dumps(state, indent=2) + '\n')
    return removed


def main():
    queue = review.fetch_queue('Follow up', include_responded=False, max_results=200)
    items = queue.get('items', []) or []
    print(f'Fetched {len(items)} Follow up items', flush=True)
    false_positives = []
    kept = []
    errors = []

    for idx, item in enumerate(items, start=1):
        if idx == 1 or idx % 10 == 0:
            print(f'Checking {idx}/{len(items)}...', flush=True)
        msg_id = str(item.get('id', '')).strip()
        thread_id = str(item.get('threadId', '')).strip()
        if not msg_id or not thread_id:
            kept.append(item)
            continue
        try:
            thread = runner.thread_details(thread_id, use_cache=False)
            already_replied = runner.thread_has_internal_reply_after(thread, msg_id)
            if already_replied:
                # Reuse the patched label logic: valid + later internal reply => Responded.
                runner.apply_response_label(msg_id, 'valid', thread_id)
                false_positives.append({
                    'id': msg_id,
                    'threadId': thread_id,
                    'from': item.get('from', ''),
                    'fromEmail': item.get('fromEmail', ''),
                    'subject': item.get('subject', ''),
                    'date': item.get('date', ''),
                })
            else:
                kept.append(item)
        except Exception as exc:
            errors.append({
                'id': msg_id,
                'threadId': thread_id,
                'from': item.get('from', ''),
                'subject': item.get('subject', ''),
                'error': str(exc),
            })
            kept.append(item)

    removed_snapshot_items = clean_state_snapshots(
        {x['id'] for x in false_positives},
        {x['threadId'] for x in false_positives},
    )

    # Fetch a fresh queue after label changes for verification.
    refreshed = review.fetch_queue('Follow up', include_responded=False, max_results=500)
    summary = {
        'at': datetime.now().isoformat(),
        'initialFollowUpCount': len(items),
        'markedRespondedCount': len(false_positives),
        'remainingFollowUpCount': len(refreshed.get('items', []) or []),
        'snapshotItemsRemoved': removed_snapshot_items,
        'errorsCount': len(errors),
        'markedResponded': false_positives,
        'errors': errors,
        'remainingSample': [
            {
                'id': x.get('id'),
                'threadId': x.get('threadId'),
                'from': x.get('from'),
                'subject': x.get('subject'),
                'date': x.get('date'),
            }
            for x in (refreshed.get('items', []) or [])[:25]
        ],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
