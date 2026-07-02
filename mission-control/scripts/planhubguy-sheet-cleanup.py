#!/usr/bin/env python3
import json
import subprocess
from collections import Counter
from pathlib import Path

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
ACCOUNT = 'drs@drs-engineering.net'
OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-sheet-cleanup-summary.json')


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


def normalize_outreach_row(row):
    vals = list(row)
    if len(vals) >= 12:
        return vals[:12]
    if len(vals) == 10:
        email, contact, date_sent, template, projects, notes, status, stage, message_id, thread_id = vals
        return [email, contact, date_sent, template, projects, '', '', notes, status, stage, message_id, thread_id]
    if len(vals) == 9 and not any((vals[i] if i < len(vals) else '').strip() for i in range(0, 5)):
        return ['', '', '', '', '', vals[5] if len(vals) > 5 else '', '', vals[7] if len(vals) > 7 else '', vals[8] if len(vals) > 8 else '', '', '', '']
    return (vals + [''] * 12)[:12]


def dedupe_response_rows(rows):
    header = rows[0]
    out = [header]
    seen = set()
    dropped = []
    for idx, row in enumerate(rows[1:], start=2):
        email = (row[0] if len(row) > 0 else '').strip().lower()
        date = (row[1] if len(row) > 1 else '').strip()
        rtype = (row[2] if len(row) > 2 else '').strip().lower()
        thread = (row[3] if len(row) > 3 else '').strip()
        sender = (row[4] if len(row) > 4 else '').strip()
        subject = (row[5] if len(row) > 5 else '').strip()
        snippet = (row[6] if len(row) > 6 else '').strip()
        projects = (row[7] if len(row) > 7 else '').strip()
        notes = (row[8] if len(row) > 8 else '').strip()
        if rtype == 'valid' and not email and not sender and not subject and not snippet and not projects:
            dropped.append({'rowIndex': idx, 'reason': 'empty_unmatched_valid'})
            continue
        key = (email, thread, subject, rtype)
        if key in seen:
            dropped.append({'rowIndex': idx, 'reason': 'duplicate', 'key': key})
            continue
        seen.add(key)
        out.append([email, date, rtype, thread, sender, subject, snippet, projects, notes])
    return out, dropped


def main():
    outreach = sheet_get('Outreach Log!A1:L2000')
    response = sheet_get('Response Log!A1:I2000')

    normalized_outreach = [outreach[0]]
    outreach_repairs = []
    for idx, row in enumerate(outreach[1:], start=2):
        fixed = normalize_outreach_row(row)
        normalized_outreach.append(fixed)
        if list(row) != fixed:
            outreach_repairs.append({'rowIndex': idx, 'fromLen': len(row), 'toLen': len(fixed)})

    cleaned_response, response_drops = dedupe_response_rows(response)

    sheet_update('Outreach Log!A1:L2000', normalized_outreach)
    sheet_update('Response Log!A1:I2000', cleaned_response)

    summary = {
        'outreachRepairCount': len(outreach_repairs),
        'responseDropCount': len(response_drops),
        'responseDropReasons': Counter(item['reason'] for item in response_drops),
        'outreachRepairsSample': outreach_repairs[:100],
        'responseDropsSample': response_drops[:100],
    }
    OUT.write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2, default=str))


if __name__ == '__main__':
    main()
