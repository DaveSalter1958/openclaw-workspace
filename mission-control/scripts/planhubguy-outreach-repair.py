#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
ACCOUNT = 'drs@drs-engineering.net'
OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-outreach-repair-summary.json')


def run(*args):
    proc = subprocess.run(list(args), text=True, capture_output=True)
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, args, output=proc.stdout, stderr=proc.stderr)
    return proc.stdout


def sheet_get(rng):
    return json.loads(run('gog', 'sheets', 'get', WORKBOOK_ID, rng, '-a', ACCOUNT, '-j', '--results-only'))


def sheet_update(rng, values, mode='RAW'):
    payload = json.dumps(values)
    run('gog', 'sheets', 'update', WORKBOOK_ID, rng, '-a', ACCOUNT, '--input', mode, f'--values-json={payload}')


def normalize_row(row):
    vals = list(row)
    if len(vals) == 12:
        return vals
    if len(vals) == 10:
        email, contact, date_sent, template, projects, notes, status, stage, message_id, thread_id = vals
        return [
            email,
            contact,
            date_sent,
            template,
            projects,
            '',
            '',
            notes,
            status,
            stage,
            message_id,
            thread_id,
        ]
    if len(vals) == 11 and vals[:7] == ['', '', '', '', '', '', '']:
        _, _, _, _, _, _, _, notes_or_date, maybe_status, maybe_stage, maybe_message = vals
        return [
            '', '', '', '', '',
            notes_or_date if isinstance(notes_or_date, str) and notes_or_date[:4].isdigit() else '',
            '',
            maybe_stage or '',
            maybe_message or '',
            '',
            '',
            '',
        ]
    padded = vals + [''] * (12 - len(vals))
    return padded[:12]


def main():
    rows = sheet_get('Outreach Log!A1:L1200')
    header = rows[0]
    body = rows[1:]
    repairs = []
    normalized = [header]
    for idx, row in enumerate(body, start=2):
        fixed = normalize_row(row)
        normalized.append(fixed)
        if list(row) != fixed:
            repairs.append({'rowIndex': idx, 'fromLen': len(row), 'toLen': len(fixed)})
    sheet_update('Outreach Log!A1:L1200', normalized)
    OUT.write_text(json.dumps({'repairCount': len(repairs), 'repairs': repairs[:200]}, indent=2) + '\n')
    print(json.dumps({'repairCount': len(repairs), 'output': str(OUT)}, indent=2))


if __name__ == '__main__':
    main()
