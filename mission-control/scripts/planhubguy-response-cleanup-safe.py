#!/usr/bin/env python3
import datetime as dt
import json
import subprocess
from collections import Counter
from pathlib import Path

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
ACCOUNT = 'drs@drs-engineering.net'
RESPONSE_RANGE = 'Response Log!A1:I12000'
OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-response-cleanup-safe-summary.json')
SNAPSHOT_DIR = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/response-log-snapshots')


def run(*args):
    proc = subprocess.run(list(args), text=True, capture_output=True)
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, args, output=proc.stdout, stderr=proc.stderr)
    return proc.stdout


def sheet_get(rng):
    return json.loads(run('gog', 'sheets', 'get', WORKBOOK_ID, rng, '-a', ACCOUNT, '-j', '--results-only'))


def sheet_update(rng, values, mode='RAW'):
    payload = json.dumps(values)
    return run('gog', 'sheets', 'update', WORKBOOK_ID, rng, '-a', ACCOUNT, '--input', mode, f'--values-json={payload}')


def normalize_row(row):
    vals = list((row + [''] * 9)[:9])
    email = str(vals[0]).strip().lower()
    date = str(vals[1]).strip()
    rtype = str(vals[2]).strip().lower()
    thread = str(vals[3]).strip()
    sender = str(vals[4]).strip()
    subject = str(vals[5]).strip()
    snippet = str(vals[6]).strip()
    projects = str(vals[7]).strip()
    notes = str(vals[8]).strip()
    return [email, date, rtype, thread, sender, subject, snippet, projects, notes]


def canonical_key(row):
    email, _date, rtype, thread, sender, subject, snippet, projects, _notes = row
    return (
        email,
        thread,
        subject,
        rtype,
        sender,
        projects,
        snippet[:160],
    )


def should_drop(row):
    email, _date, rtype, thread, sender, subject, snippet, projects, _notes = row
    if rtype == 'valid' and not any([email, sender, subject, snippet, projects]):
        return 'empty_valid'
    return ''


def clean_rows(rows):
    header = rows[0] if rows else ['email', 'receivedDate', 'type', 'threadId', 'sender', 'subject', 'snippet', 'projects', 'notes']
    kept = [header]
    seen = set()
    dropped = []
    for idx, raw in enumerate(rows[1:], start=2):
        row = normalize_row(raw)
        reason = should_drop(row)
        if reason:
            dropped.append({'rowIndex': idx, 'reason': reason, 'row': row})
            continue
        key = canonical_key(row)
        if key in seen:
            dropped.append({'rowIndex': idx, 'reason': 'duplicate', 'row': row})
            continue
        seen.add(key)
        kept.append(row)
    return kept, dropped


def write_snapshot(rows):
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    path = SNAPSHOT_DIR / f'response-log-pre-cleanup-{stamp}.json'
    path.write_text(json.dumps(rows, indent=2, default=str) + '\n')
    return path


def main():
    apply_changes = '--apply' in __import__('sys').argv
    rows = sheet_get(RESPONSE_RANGE)
    cleaned, dropped = clean_rows(rows)
    summary = {
        'originalRows': max(0, len(rows) - 1),
        'cleanedRows': max(0, len(cleaned) - 1),
        'droppedRows': len(dropped),
        'dropReasons': Counter(item['reason'] for item in dropped),
        'sampleDrops': dropped[:50],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, indent=2, default=str) + '\n')
    print(json.dumps(summary, indent=2, default=str))
    if not apply_changes:
        return
    snapshot_path = write_snapshot(rows)
    if not snapshot_path.exists() or snapshot_path.stat().st_size <= 2:
        raise RuntimeError(f'Pre-cleanup snapshot failed: {snapshot_path}')
    sheet_update(RESPONSE_RANGE, cleaned)
    print(json.dumps({'applied': True, 'snapshot': str(snapshot_path)}, indent=2))


if __name__ == '__main__':
    main()
