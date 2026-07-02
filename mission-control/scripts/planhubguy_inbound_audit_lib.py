#!/usr/bin/env python3
import json
import re
import subprocess
from pathlib import Path

WORKBOOK_ID = '1AJ5p4YHb3T1PtfFW8CFulVK1cHcDZT7cqrTxoo3An7s'
SHEETS_ACCOUNT = 'drs@drs-engineering.net'
MAIL_ACCOUNT = 'Dave@DRS-Engineering.net'
INTERNAL_SENDERS = {
    'dave@drs-engineering.net',
    'drs@drs-engineering.net',
    'luke@drs-engineering.net',
}
MAILBOX_REPLY_QUERIES = [
    'newer_than:30d (subject:"Re: Regarding" OR subject:"RE: Regarding" OR subject:"Fw: Regarding" OR subject:"Fwd: Regarding")',
    'newer_than:30d in:spam (subject:"Re: Regarding" OR subject:"RE: Regarding" OR subject:"Fw: Regarding" OR subject:"Fwd: Regarding")',
]
BOUNCE_MARKERS = [
    'mailer-daemon', 'postmaster', 'delivery status notification', 'delivery failure',
    'undeliverable', 'returned mail', 'delivery incomplete', 'failure notice', 'address not found',
    'message blocked', 'recipient address rejected'
]
AUTO_REPLY_MARKERS = ['out of office', 'automatic reply', 'auto reply', 'autoreply', 'vacation', 'away from the office']


def run(*args):
    proc = subprocess.run(list(args), text=True, capture_output=True)
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, args, output=proc.stdout, stderr=proc.stderr)
    return proc.stdout


def read_json(path: Path):
    return json.loads(path.read_text())


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str) + '\n')


def sheet_get(rng):
    return json.loads(run('gog', 'sheets', 'get', WORKBOOK_ID, rng, '-a', SHEETS_ACCOUNT, '-j', '--results-only'))


def sheet_append(rng, values, mode='RAW'):
    payload = json.dumps(values)
    return run('gog', 'sheets', 'append', WORKBOOK_ID, rng, '-a', SHEETS_ACCOUNT, '--input', mode, f'--values-json={payload}')


def extract_email(text):
    m = re.search(r'([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})', text or '', re.I)
    return m.group(1).strip().lower() if m else ''


def classify_message(info):
    from_text = (info.get('from') or '').lower()
    subject_text = (info.get('subject') or '').lower()
    snippet_text = (info.get('snippet') or '').lower()
    blob = ' '.join([from_text, subject_text, snippet_text])
    auto_submitted = (info.get('autoSubmitted') or '').lower()
    if auto_submitted in {'auto-replied', 'auto-generated'}:
        if any(marker in blob for marker in BOUNCE_MARKERS) or 'delivery status notification' in blob or 'undeliverable' in blob:
            return 'bounce'
        return 'auto'
    if any(marker in blob for marker in BOUNCE_MARKERS):
        return 'bounce'
    if any(marker in blob for marker in AUTO_REPLY_MARKERS):
        return 'auto'
    if 'noreply' in from_text or 'no-reply' in from_text:
        return 'system'
    return 'valid'


def search_gmail(query, account=MAIL_ACCOUNT, max_results=500):
    payload = json.loads(run('gog', 'gmail', 'messages', 'search', query, '-a', account, '-j', '--all', '--max', str(max_results)))
    return payload.get('messages', [])


def fetch_message_by_sender_subject(sender, subject, account=MAIL_ACCOUNT, max_results=10):
    sender = (sender or '').strip().lower()
    subject = (subject or '').strip()
    if not sender or not subject:
        return []
    safe_subject = subject.replace('"', '')
    queries = [
        f'newer_than:30d in:anywhere from:{sender} subject:"{safe_subject}"',
        f'newer_than:30d in:spam from:{sender} subject:"{safe_subject}"',
    ]
    seen = set()
    results = []
    for query in queries:
        for msg in search_gmail(query, account=account, max_results=max_results):
            if extract_email(msg.get('from', '')) != sender:
                continue
            if (msg.get('subject', '') or '').strip() != subject:
                continue
            msg_id = msg.get('id', '')
            if msg_id and msg_id not in seen:
                seen.add(msg_id)
                results.append({
                    'id': msg_id,
                    'threadId': msg.get('threadId', ''),
                    'from': msg.get('from', ''),
                    'subject': msg.get('subject', ''),
                    'snippet': msg.get('snippet', ''),
                    'labels': msg.get('labelIds', []),
                    'autoSubmitted': msg.get('autoSubmitted', ''),
                })
    return results


def mailbox_valid_reply_audit(query_limit=500):
    seen = {}
    query_counts = {}
    for query in MAILBOX_REPLY_QUERIES:
        messages = search_gmail(query, account=MAIL_ACCOUNT, max_results=query_limit)
        query_counts[query] = len(messages)
        for msg in messages:
            mid = msg.get('id', '')
            if not mid or mid in seen:
                continue
            info = {
                'id': mid,
                'threadId': msg.get('threadId', ''),
                'from': msg.get('from', ''),
                'subject': msg.get('subject', ''),
                'snippet': msg.get('snippet', ''),
                'labels': msg.get('labelIds', []),
                'autoSubmitted': msg.get('autoSubmitted', ''),
            }
            info['classification'] = classify_message(info)
            info['senderEmail'] = extract_email(info['from'])
            seen[mid] = info
    rows = list(seen.values())
    valid = [
        {
            'id': item['id'],
            'threadId': item['threadId'],
            'from': item['from'],
            'senderEmail': item['senderEmail'],
            'subject': item['subject'],
            'labels': item['labels'],
        }
        for item in rows if item['classification'] == 'valid'
    ]
    external_valid = [item for item in valid if item['senderEmail'] not in INTERNAL_SENDERS]
    internal_valid = [item for item in valid if item['senderEmail'] in INTERNAL_SENDERS]
    return {
        'queryCounts': query_counts,
        'uniqueMessages': len(rows),
        'classificationCounts': {
            key: len([r for r in rows if r['classification'] == key])
            for key in sorted({r['classification'] for r in rows})
        },
        'validCount': len(valid),
        'externalValidCount': len(external_valid),
        'internalValidCount': len(internal_valid),
        'externalValidSample': external_valid,
        'internalValidSample': internal_valid,
    }


def response_log_valid_rows(response_range='Response Log!A1:I12000'):
    rows = sheet_get(response_range)
    valid_rows = []
    existing_keys = set()
    existing_semantic_keys = set()
    for row in rows[1:]:
        rtype = (row[2] if len(row) > 2 else '').strip().lower()
        if rtype != 'valid':
            continue
        email = (row[0] if len(row) > 0 else '').strip().lower()
        thread = (row[3] if len(row) > 3 else '').strip()
        subject = (row[5] if len(row) > 5 else '').strip()
        valid_rows.append({'email': email, 'threadId': thread, 'subject': subject})
        existing_keys.add((email, thread, subject))
        existing_semantic_keys.add((email, subject))
    return valid_rows, existing_keys, existing_semantic_keys
