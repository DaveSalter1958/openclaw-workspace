#!/usr/bin/env python3
"""Reconcile PlanHubGuy Follow up queue items that have sent-reply evidence.

Actions:
- Gmail: remove Follow up/Automatic Reply/Bad Email labels from the original queue thread; add Responded.
- Outreach Log: append a manual-reply-reconciled row for sent replies not already logged.
- Outreach Log: mark matching active/replied campaign rows as Responded where safe.

Does not send email.
"""
import datetime as dt
import email.utils
import importlib.util
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
RUNNER_PATH = SCRIPT_DIR / 'planhubguy-runner.py'
spec = importlib.util.spec_from_file_location('planhubguy_runner', RUNNER_PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)  # type: ignore[attr-defined]

REPORT_PATH = SCRIPT_DIR / 'tmp' / 'planhubguy-followup-audit.json'
OUT_PATH = SCRIPT_DIR / 'tmp' / 'planhubguy-followup-reconcile-summary.json'

REMOVE_LABELS = ['Follow up', 'Automatic Reply', 'Bad Email']


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
    thread = runner.thread_details(thread_id, use_cache=False)
    return [m.get('id','') for m in thread.get('messages', []) or [] if m.get('id')]


def mark_thread_responded(thread_id):
    changed = []
    failures = []
    for mid in thread_message_ids(thread_id):
        args = ['gog', 'gmail', 'batch', 'modify', mid, '-a', runner.INBOUND_ACCOUNT, '--add', 'Responded']
        for label in REMOVE_LABELS:
            args.extend(['--remove', label])
        args.append('-y')
        try:
            runner.run(*args)
            changed.append(mid)
        except Exception as exc:
            failures.append({'messageId': mid, 'error': str(exc)})
    return changed, failures


def load_response_project_map():
    rows = runner.sheet_get('Response Log!A1:I12000')
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
    by_thread, by_email = load_response_project_map()
    outreach = runner.sheet_get('Outreach Log!A1:L12000')
    existing_message_ids = {((row + [''] * 12)[:12][10] or '').strip() for row in outreach[1:]}

    appended_rows = []
    label_threads = {}
    status_updates = []
    now = dt.datetime.now().isoformat()

    for rec in report.get('respondedEvidence', []):
        q = rec.get('queueItem', {})
        email_addr = (q.get('fromEmail') or '').strip().lower()
        queue_thread = (q.get('threadId') or '').strip()
        sent = best_sent_match(rec.get('sentMatches', []))
        if not email_addr or not queue_thread or not sent:
            continue
        label_threads.setdefault(queue_thread, q.get('id',''))
        projects = by_thread.get(queue_thread) or by_email.get(email_addr) or ''
        sent_id = (sent.get('id') or '').strip()
        if sent_id and sent_id not in existing_message_ids:
            note = runner.make_outbound_linkage_note(
                f'Reconciled manual reply from sent mail on {now}; sentAccount={sent.get("account", "")}',
                sent.get('subject') or q.get('subject') or '',
                email_addr,
            )
            appended_rows.append([
                email_addr,
                '',
                date_only(sent.get('date') or sent.get('dateUtc') or ''),
                'manual-reply-reconciled',
                projects,
                '',
                '',
                note,
                'Responded',
                'ManualReply',
                sent_id,
                sent.get('threadId',''),
            ])
            existing_message_ids.add(sent_id)

    # Mark existing campaign rows as Responded where they correspond to queued emails/threads and are not terminal.
    responded_emails = {(rec.get('queueItem', {}).get('fromEmail') or '').strip().lower() for rec in report.get('respondedEvidence', [])}
    responded_threads = {(rec.get('queueItem', {}).get('threadId') or '').strip() for rec in report.get('respondedEvidence', [])}
    for idx, row in enumerate(outreach[1:], start=2):
        padded = (row + [''] * 12)[:12]
        email_addr = padded[0].strip().lower()
        status = padded[8].strip()
        thread = padded[11].strip()
        if status in {'Bounced', 'Closed', 'Do Not Contact', 'Responded'}:
            continue
        if email_addr in responded_emails or (thread and thread in responded_threads):
            status_updates.append(idx)

    changed_label_ids = []
    label_failures = []
    for thread in sorted(label_threads):
        changed, failures = mark_thread_responded(thread)
        changed_label_ids.extend(changed)
        for failure in failures:
            failure['threadId'] = thread
        label_failures.extend(failures)

    if appended_rows:
        runner.sheet_append('Outreach Log!A:L', appended_rows)

    for idx in status_updates:
        runner.sheet_update(f'Outreach Log!I{idx}:J{idx}', [['Responded', 'ManualReply']])

    summary = {
        'generatedAt': now,
        'sourceReport': str(REPORT_PATH),
        'respondedEvidenceCount': report.get('respondedEvidenceCount'),
        'threadsMarkedResponded': len(label_threads),
        'gmailMessagesRelabeled': len(set(changed_label_ids)),
        'manualReplyRowsAppended': len(appended_rows),
        'outreachRowsMarkedResponded': len(status_updates),
        'labelFailures': label_failures,
        'unresolvedCount': report.get('unresolvedCount'),
        'unresolved': report.get('unresolved', []),
    }
    OUT_PATH.write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: summary[k] for k in ['threadsMarkedResponded','gmailMessagesRelabeled','manualReplyRowsAppended','outreachRowsMarkedResponded','unresolvedCount']}, indent=2))

if __name__ == '__main__':
    main()
