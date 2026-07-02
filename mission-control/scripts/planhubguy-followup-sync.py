#!/usr/bin/env python3
"""Refresh/reconcile PlanHubGuy follow-up queue.

This is safe under external-email hold: it sends no email. It only reads Gmail sent
mail, updates Gmail labels, and repairs Outreach Log rows when a queued follow-up
has clear sent-reply evidence.
"""
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
TMP = SCRIPT_DIR / 'tmp'
QUEUE_PATH = TMP / 'planhubguy-followup-queue-before.json'
AFTER_PATH = TMP / 'planhubguy-followup-queue-after.json'
AUDIT_PATH = TMP / 'planhubguy-followup-audit.json'
SUMMARY_PATH = TMP / 'planhubguy-followup-reconcile-summary.json'


def run(*args):
    proc = subprocess.run(args, cwd=str(SCRIPT_DIR.parent.parent), text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(f'{args} failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}')
    return proc.stdout


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    before_stdout = run('/usr/bin/python3', str(SCRIPT_DIR / 'planhubguy-review.py'), 'list', '--label', 'Follow up', '--max', '200')
    QUEUE_PATH.write_text(before_stdout)
    before = json.loads(before_stdout or '{}').get('items', [])

    audit_stdout = run('/usr/bin/python3', str(SCRIPT_DIR / 'planhubguy-followup-audit.py'))
    audit = json.loads(AUDIT_PATH.read_text())

    reconcile = {}
    if int(audit.get('respondedEvidenceCount') or 0) > 0:
        run('/usr/bin/python3', str(SCRIPT_DIR / 'planhubguy-followup-reconcile-api.py'))
        reconcile = json.loads(SUMMARY_PATH.read_text())

    after_stdout = run('/usr/bin/python3', str(SCRIPT_DIR / 'planhubguy-review.py'), 'list', '--label', 'Follow up', '--max', '200')
    AFTER_PATH.write_text(after_stdout)
    after = json.loads(after_stdout or '{}').get('items', [])

    summary = {
        'ok': True,
        'beforeCount': len(before),
        'sentReplyEvidenceCount': audit.get('respondedEvidenceCount', 0),
        'afterCount': len(after),
        'removedFromQueue': max(0, len(before) - len(after)),
        'manualReplyRowsAppended': reconcile.get('manualReplyRowsAppended', 0),
        'outreachRowsMarkedResponded': reconcile.get('outreachRowsMarkedResponded', 0),
        'labelFailures': reconcile.get('labelFailures', []),
        'unresolvedCount': len(after),
    }
    print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
