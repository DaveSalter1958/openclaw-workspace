
#!/usr/bin/env python3
import collections
import json
import re
import subprocess
from pathlib import Path

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
ACCOUNT = 'drs@drs-engineering.net'
OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-response-repair-output.json')

BOUNCE_MARKERS = [
    'mailer-daemon', 'postmaster', 'delivery status notification', 'delivery failure',
    'undeliverable', 'returned mail', 'delivery incomplete', 'failure notice', 'address not found',
    'message blocked', 'recipient address rejected', 'message not delivered', 'delivery has failed'
]
AUTO_REPLY_MARKERS = ['out of office', 'automatic reply', 'auto reply', 'autoreply', 'vacation', 'away from the office']


def run(*args):
    proc = subprocess.run(list(args), text=True, capture_output=True)
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, args, output=proc.stdout, stderr=proc.stderr)
    return proc.stdout


def sheet_get(rng):
    return json.loads(run('gog', 'sheets', 'get', WORKBOOK_ID, rng, '-a', ACCOUNT, '-j', '--results-only'))


def thread_details(thread_id):
    payload = json.loads(run('gog', 'gmail', 'thread', 'get', thread_id, '-a', ACCOUNT, '-j'))
    return payload.get('thread', {})


def get_header(headers, name):
    for h in headers or []:
        if (h.get('name') or '').lower() == name.lower():
            return h.get('value', '')
    return ''


def extract_email(text):
    m = re.search(r'<([^>]+@[^>]+)>', text or '')
    if m:
        return m.group(1).strip().lower()
    m = re.search(r'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})', text or '', re.I)
    return m.group(1).lower() if m else ''


def classify(info):
    blob = ' '.join([(info.get('from') or '').lower(), (info.get('subject') or '').lower(), (info.get('snippet') or '').lower()])
    labels = set(info.get('labels', []))
    auto_submitted = (info.get('autoSubmitted') or '').lower()
    if 'SPAM' in labels:
        return 'system'
    if auto_submitted in {'auto-replied', 'auto-generated'}:
        if any(marker in blob for marker in BOUNCE_MARKERS) or 'delivery status notification' in blob or 'undeliverable' in blob:
            return 'bounce'
        return 'auto'
    if any(marker in blob for marker in BOUNCE_MARKERS):
        return 'bounce'
    if any(marker in blob for marker in AUTO_REPLY_MARKERS):
        return 'auto'
    if 'noreply' in blob or 'no-reply' in blob:
        return 'system'
    return 'valid'


def main():
    response_rows = sheet_get('Response Log!A1:I500')
    outreach_rows = sheet_get('Outreach Log!A1:L1200')
    response_by_thread = collections.defaultdict(list)
    for idx, row in enumerate(response_rows[1:], start=2):
        thread_id = (row[3] if len(row) > 3 else '').strip()
        if thread_id:
            response_by_thread[thread_id].append((idx, row))

    repair = []
    for thread_id, rows in response_by_thread.items():
        thread = thread_details(thread_id)
        messages = thread.get('messages', [])
        if len(messages) < 2:
            continue
        inbound = messages[-1]
        headers = inbound.get('payload', {}).get('headers', [])
        info = {
            'from': get_header(headers, 'From'),
            'subject': get_header(headers, 'Subject'),
            'snippet': inbound.get('snippet', ''),
            'labels': inbound.get('labelIds', []),
            'autoSubmitted': get_header(headers, 'Auto-Submitted'),
        }
        actual = classify(info)
        for idx, row in rows:
            current = (row[2] if len(row) > 2 else '').strip().lower()
            if current != actual:
                repair.append({
                    'rowIndex': idx,
                    'threadId': thread_id,
                    'current': current,
                    'actual': actual,
                    'email': row[0] if len(row) > 0 else '',
                    'subject': info['subject'],
                    'from': info['from'],
                })

    OUT.write_text(json.dumps({'repairCount': len(repair), 'repairs': repair}, indent=2) + '\n')
    print(json.dumps({'repairCount': len(repair), 'output': str(OUT)}, indent=2))


if __name__ == '__main__':
    main()
