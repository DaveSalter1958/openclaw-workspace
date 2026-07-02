#!/usr/bin/env python3
import datetime as dt
import json
import subprocess
from pathlib import Path

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
ACCOUNT = 'drs@drs-engineering.net'
RESPONSE_RANGE = 'Response Log!A1:I12000'
OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-response-reorganize-summary.json')
SNAPSHOT_DIR = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/response-log-snapshots')

def parse_date(value):
    text = str(value or '').strip()
    if not text:
        return dt.date.min
    try:
        return dt.date.fromisoformat(text)
    except Exception:
        return dt.date.min


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
    vals[0] = str(vals[0]).strip().lower()
    vals[1] = str(vals[1]).strip()
    vals[2] = str(vals[2]).strip().lower()
    vals[3] = str(vals[3]).strip()
    vals[4] = str(vals[4]).strip()
    vals[5] = str(vals[5]).strip()
    vals[6] = str(vals[6]).strip()
    vals[7] = str(vals[7]).strip()
    vals[8] = str(vals[8]).strip()
    return vals


def sort_key(row):
    email, date, rtype, thread, sender, subject, snippet, projects, notes = row
    sort_date = parse_date(date)
    return (
        -sort_date.toordinal(),
        email,
        sender.lower(),
        subject.lower(),
        thread,
        rtype,
        projects.lower(),
        snippet.lower()[:80],
        notes.lower(),
    )


def build_reorganized(rows):
    header = rows[0] if rows else ['email', 'receivedDate', 'responseType', 'threadId', 'sender', 'subject', 'snippet', 'linkedProjects', 'notes']
    body = [normalize_row(row) for row in rows[1:] if any(str(v).strip() for v in row)]
    reorganized = sorted(body, key=sort_key)
    return [header] + reorganized


def write_snapshot(rows):
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    path = SNAPSHOT_DIR / f'response-log-pre-reorg-{stamp}.json'
    path.write_text(json.dumps(rows, indent=2, default=str) + '\n')
    return path


def main():
    apply_changes = '--apply' in __import__('sys').argv
    rows = sheet_get(RESPONSE_RANGE)
    reorganized = build_reorganized(rows)
    body = reorganized[1:]
    summary = {
        'rowCount': len(body),
        'validCount': sum(1 for row in body if row[2] == 'valid'),
        'autoCount': sum(1 for row in body if row[2] == 'auto'),
        'systemCount': sum(1 for row in body if row[2] == 'system'),
        'bounceCount': sum(1 for row in body if row[2] == 'bounce'),
        'firstRowsPreview': body[:15],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, indent=2, default=str) + '\n')
    print(json.dumps(summary, indent=2, default=str))
    if not apply_changes:
        return
    snapshot_path = write_snapshot(rows)
    if not snapshot_path.exists() or snapshot_path.stat().st_size <= 2:
        raise RuntimeError(f'Pre-reorg snapshot failed: {snapshot_path}')
    sheet_update(RESPONSE_RANGE, reorganized)
    print(json.dumps({'applied': True, 'snapshot': str(snapshot_path)}, indent=2))


if __name__ == '__main__':
    main()
