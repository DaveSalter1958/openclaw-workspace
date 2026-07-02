#!/usr/bin/env python3
"""Refresh Mission Control PlanHubGuy queue snapshots.

Keeps Possible Work and Follow up queues populated automatically from Gmail labels.
Automatic Reply is intentionally hidden from Mission Control per Dave's preference.
"""
import json
import subprocess
import datetime as dt
import tempfile
import os
from pathlib import Path

STATE_FILE = Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-state.json')
REVIEW = '/home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-review.py'


def fetch(label: str, max_items: int = 200):
    proc = subprocess.run(['/usr/bin/python3', REVIEW, 'list', '--label', label, '--max', str(max_items)], text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or f'queue fetch failed: {label}')
    payload = json.loads(proc.stdout or '{}')
    return payload.get('items') if isinstance(payload.get('items'), list) else []


def main():
    try:
        state = json.loads(STATE_FILE.read_text())
    except Exception:
        state = {'enabled': False, 'mode': 'test'}
    snapshots = state.get('replyQueueSnapshots') if isinstance(state.get('replyQueueSnapshots'), dict) else {}
    snapshots['Possible Work'] = fetch('Possible Work')
    snapshots['Follow up'] = fetch('Follow up')
    snapshots['Automatic Reply'] = []
    state['replyQueueSnapshots'] = snapshots
    state['replyQueueSnapshotsUpdatedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=str(STATE_FILE.parent), prefix=f'{STATE_FILE.name}.', suffix='.tmp', delete=False) as tmp:
        json.dump(state, tmp, indent=2)
        tmp.write('\n')
        tmp_path = Path(tmp.name)
    os.replace(tmp_path, STATE_FILE)
    print(json.dumps({
        'ok': True,
        'possibleWorkCount': len(snapshots['Possible Work']),
        'followUpCount': len(snapshots['Follow up']),
        'automaticHidden': True,
    }))


if __name__ == '__main__':
    main()
