#!/usr/bin/env python3
"""Fast API reconciliation for PlanHubGuy Follow up items with sent-reply evidence.

No email is sent. Uses Gmail API for labels and Sheets API for log repair.
"""
import datetime as dt
import email.utils
import importlib.util
import json
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
RUNNER_PATH = SCRIPT_DIR / 'planhubguy-runner.py'
spec = importlib.util.spec_from_file_location('planhubguy_runner', RUNNER_PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)  # type: ignore[attr-defined]

REPORT_PATH = SCRIPT_DIR / 'tmp' / 'planhubguy-followup-audit.json'
OUT_PATH = SCRIPT_DIR / 'tmp' / 'planhubguy-followup-reconcile-summary.json'
GMAIL_ACCOUNT = runner.INBOUND_ACCOUNT
SHEETS_ACCOUNT = runner.SHEETS_ACCOUNT
SPREADSHEET_ID = runner.WORKBOOK_ID
ADD_LABEL = 'Responded'
REMOVE_LABELS = ['Follow up', 'Automatic Reply', 'Bad Email']
TOKEN_CACHE = {}


def token(account):
    if account not in TOKEN_CACHE:
        TOKEN_CACHE[account] = runner.gmail_access_token(account)
    return TOKEN_CACHE[account]


def request_json(method, url, account, payload=None):
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': f'Bearer {token(account)}',
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode('utf-8')
        return json.loads(text) if text else {}


def gmail_api(path, params=None, method='GET', payload=None):
    url = 'https://gmail.googleapis.com/gmail/v1/users/me/' + path
    if params:
        url += '?' + urllib.parse.urlencode(params, doseq=True)
    return request_json(method, url, GMAIL_ACCOUNT, payload)


def sheets_api(path, method='GET', payload=None, params=None):
    url = f'https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/' + path
    if params:
        url += '?' + urllib.parse.urlencode(params, doseq=True)
    return request_json(method, url, SHEETS_ACCOUNT, payload)


def label_ids():
    payload = gmail_api('labels')
    by_name = {item.get('name'): item.get('id') for item in payload.get('labels', []) if item.get('name') and item.get('id')}
    missing = [name for name in [ADD_LABEL, *REMOVE_LABELS] if name not in by_name]
    if missing:
        raise RuntimeError(f'Missing Gmail labels: {missing}')
    return by_name


def parse_date(value):
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except Exception:
        try:
            return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(dt.timezone.utc)
        except Exception:
            return None


def date_only(value):
    parsed = parse_date(value)
    return parsed.date().isoformat() if parsed else dt.date.today().isoformat()


def best_sent_match(matches):
    clean = [m for m in matches if not m.get('error') and m.get('id')]
    if not clean:
        return None
    def key(m):
        same_thread = 0 if m.get('matchByThread') else 1
        parsed = parse_date(m.get('date') or m.get('dateUtc') or '')
        return (same_thread, parsed or dt.datetime.max.replace(tzinfo=dt.timezone.utc))
    return sorted(clean, key=key)[0]


def thread_message_ids(thread_id):
    thread = gmail_api(f'threads/{thread_id}', {'format': 'minimal'})
    return [m.get('id') for m in thread.get('messages', []) or [] if m.get('id')]


def modify_message_labels(message_id, labels):
    gmail_api(f'messages/{message_id}/modify', method='POST', payload={
        'addLabelIds': [labels[ADD_LABEL]],
        'removeLabelIds': [labels[name] for name in REMOVE_LABELS],
    })


def get_sheet_values(range_name):
    return sheets_api('values/' + urllib.parse.quote(range_name, safe=''), params={'majorDimension': 'ROWS'}).get('values', [])


def append_sheet_values(range_name, rows):
    if not rows:
        return {}
    path = 'values/' + urllib.parse.quote(range_name, safe='') + ':append'
    return sheets_api(path, method='POST', params={'valueInputOption': 'USER_ENTERED', 'insertDataOption': 'INSERT_ROWS'}, payload={'values': rows})


def batch_update_values(data):
    if not data:
        return {}
    return sheets_api('values:batchUpdate', method='POST', payload={'valueInputOption': 'USER_ENTERED', 'data': data})


def load_response_project_map():
    rows = get_sheet_values('Response Log!A1:I12000')
    by_thread = {}
    by_email = {}
    for row in rows[1:]:
        padded = (row + [''] * 9)[:9]
        email = padded[0].strip().lower()
        thread = padded[3].strip()
        projects = padded[7].strip()
        if thread and projects and thread not in by_thread:
            by_thread[thread] = projects
        if email and projects and email not in by_email:
            by_email[email] = projects
    return by_thread, by_email


def main():
    report = json.loads(REPORT_PATH.read_text())
    labels = label_ids()
    by_thread, by_email = load_response_project_map()
    outreach = get_sheet_values('Outreach Log!A1:L12000')
    existing_message_ids = {((row + [''] * 12)[:12][10] or '').strip() for row in outreach[1:]}

    label_threads = {}
    appended_rows = []
    now = dt.datetime.now().isoformat()

    for rec in report.get('respondedEvidence', []):
        q = rec.get('queueItem', {})
        email_addr = (q.get('fromEmail') or '').strip().lower()
        queue_thread = (q.get('threadId') or '').strip()
        sent = best_sent_match(rec.get('sentMatches', []))
        if not email_addr or not queue_thread or not sent:
            continue
        label_threads[queue_thread] = True
        projects = by_thread.get(queue_thread) or by_email.get(email_addr) or ''
        sent_id = (sent.get('id') or '').strip()
        if sent_id and sent_id not in existing_message_ids:
            note = runner.make_outbound_linkage_note(
                f'Reconciled manual reply from sent mail on {now}; sentAccount={sent.get("account", "")}',
                sent.get('subject') or q.get('subject') or '',
                email_addr,
            )
            appended_rows.append([
                email_addr, '', date_only(sent.get('date') or sent.get('dateUtc') or ''),
                'manual-reply-reconciled', projects, '', '', note, 'Responded', 'ManualReply', sent_id, sent.get('threadId','')
            ])
            existing_message_ids.add(sent_id)

    changed_messages = []
    label_failures = []
    for thread_id in sorted(label_threads):
        try:
            ids = thread_message_ids(thread_id)
        except Exception as exc:
            label_failures.append({'threadId': thread_id, 'error': f'thread_get: {exc}'})
            continue
        for mid in ids:
            try:
                modify_message_labels(mid, labels)
                changed_messages.append(mid)
            except Exception as exc:
                label_failures.append({'threadId': thread_id, 'messageId': mid, 'error': str(exc)})

    append_sheet_values('Outreach Log!A:L', appended_rows)

    responded_emails = {(rec.get('queueItem', {}).get('fromEmail') or '').strip().lower() for rec in report.get('respondedEvidence', [])}
    responded_threads = {(rec.get('queueItem', {}).get('threadId') or '').strip() for rec in report.get('respondedEvidence', [])}
    data = []
    for idx, row in enumerate(outreach[1:], start=2):
        padded = (row + [''] * 12)[:12]
        email_addr = padded[0].strip().lower()
        status = padded[8].strip()
        thread = padded[11].strip()
        if status in {'Bounced', 'Closed', 'Do Not Contact', 'Responded'}:
            continue
        if email_addr in responded_emails or (thread and thread in responded_threads):
            data.append({'range': f'Outreach Log!I{idx}:J{idx}', 'values': [['Responded', 'ManualReply']]})
    batch_update_values(data)

    summary = {
        'generatedAt': now,
        'sourceReport': str(REPORT_PATH),
        'respondedEvidenceCount': report.get('respondedEvidenceCount'),
        'threadsMarkedResponded': len(label_threads),
        'gmailMessagesRelabeled': len(set(changed_messages)),
        'labelFailures': label_failures,
        'manualReplyRowsAppended': len(appended_rows),
        'outreachRowsMarkedResponded': len(data),
        'unresolvedCount': report.get('unresolvedCount'),
        'unresolved': report.get('unresolved', []),
    }
    OUT_PATH.write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: summary[k] for k in ['threadsMarkedResponded','gmailMessagesRelabeled','manualReplyRowsAppended','outreachRowsMarkedResponded','unresolvedCount']}, indent=2))
    if label_failures:
        print('labelFailures', len(label_failures))

if __name__ == '__main__':
    main()
