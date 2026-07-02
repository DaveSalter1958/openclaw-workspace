#!/usr/bin/env python3
"""Rebuild a read-only PlanHubGuy historical campaign ledger from immutable sources.

Sources:
- Gmail sent mail for campaign sends from Dave@DRS-Engineering.net.
- PlanHubGuy Response Log for inbound response events.

This script is deliberately read-only against Gmail/Sheets. It writes local JSONL/JSON
artifacts only.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import email.utils
import hashlib
import importlib.util
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / 'scripts'
DATA_DIR = ROOT / 'data' / 'planhubguy'
TMP_DIR = SCRIPT_DIR / 'tmp'
CACHE_DIR = TMP_DIR / 'planhubguy-ledger-cache'
RUNNER_PATH = SCRIPT_DIR / 'planhubguy-runner.py'
DEFAULT_START = dt.date(2026, 4, 1)
DEFAULT_END = dt.date.today()
EVENTS_PATH = DATA_DIR / 'campaign-events.jsonl'
SUMMARY_PATH = DATA_DIR / 'campaign-ledger-summary.json'
MARKETING_STATS_PATH = DATA_DIR / 'marketing-stats.json'
CAMPAIGN_SNAPSHOT_PATH = TMP_DIR / 'planhubguy-campaign-analysis-20260519.json'

spec = importlib.util.spec_from_file_location('planhubguy_runner', RUNNER_PATH)
runner = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(runner)  # type: ignore[attr-defined]

TOKEN_CACHE: Dict[str, str] = {}
SENT_ACCOUNTS = [runner.SEND_ACCOUNT, getattr(runner, 'LEGACY_DRS_OUTBOUND_ACCOUNT', '')]
SENT_ACCOUNTS = [account for account in dict.fromkeys(SENT_ACCOUNTS) if account]


def norm_email(value: str) -> str:
    value = (value or '').strip().lower()
    match = re.search(r'([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})', value, flags=re.I)
    return match.group(1).lower() if match else value


def parse_date(value: str) -> Optional[dt.datetime]:
    value = (value or '').strip()
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except Exception:
        pass
    for fmt in ('%Y-%m-%d %H:%M', '%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
        try:
            parsed = dt.datetime.strptime(value[:16 if '%H' in fmt else 10], fmt)
            return parsed.replace(tzinfo=dt.timezone.utc)
        except Exception:
            pass
    try:
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(dt.timezone.utc)
    except Exception:
        return None


def iso_from_internal_date(value: Any) -> str:
    try:
        millis = int(value)
        return dt.datetime.fromtimestamp(millis / 1000, tz=dt.timezone.utc).isoformat()
    except Exception:
        return ''


def date_in_range(ts_iso: str, start: dt.date, end: dt.date) -> bool:
    parsed = parse_date(ts_iso)
    if not parsed:
        return False
    return start <= parsed.date() <= end


def header_map(message: Dict[str, Any]) -> Dict[str, str]:
    headers = message.get('payload', {}).get('headers', []) or []
    out: Dict[str, str] = {}
    for item in headers:
        name = (item.get('name') or '').strip().lower()
        if name:
            out[name] = item.get('value') or ''
    return out


def split_addresses(value: str) -> List[str]:
    return sorted({addr.lower() for _name, addr in email.utils.getaddresses([value or '']) if addr})


def classify_sent_subject(subject: str) -> Optional[str]:
    clean = re.sub(r'\s+', ' ', (subject or '').strip())
    lower = clean.lower()
    if not clean:
        return None
    if 'final follow-up' in lower or 'final follow up' in lower:
        return 'sent_final_followup'
    # Template 2 is currently "Re: [Project Name]". Older prompt notes described it
    # as "Re: Regarding ...", so treat all Re: campaign-looking messages as
    # follow-up candidates, then exclude Response Log threads as likely manual replies.
    if lower.startswith('re:'):
        return 'sent_followup1'
    if 'regarding' in lower:
        return 'sent_initial'
    return None


def token(account: str) -> str:
    if account not in TOKEN_CACHE:
        TOKEN_CACHE[account] = runner.gmail_access_token(account)
    return TOKEN_CACHE[account]


def request_json(url: str, account: str, *, timeout: int = 45) -> Dict[str, Any]:
    req = urllib.request.Request(url, method='GET', headers={'Authorization': f'Bearer {token(account)}'})
    last_error: Optional[Exception] = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                text = resp.read().decode('utf-8')
                return json.loads(text) if text else {}
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code in (429, 500, 502, 503, 504):
                retry_after = exc.headers.get('Retry-After')
                delay = int(retry_after) if retry_after and retry_after.isdigit() else min(30, 2 ** attempt)
                time.sleep(delay)
                continue
            raise
        except Exception as exc:
            last_error = exc
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f'Gmail API request failed after retries: {last_error}')


def cache_path(kind: str, key: str) -> Path:
    digest = hashlib.sha256(key.encode('utf-8')).hexdigest()[:24]
    return CACHE_DIR / kind / f'{digest}.json'


def cached_json(kind: str, key: str, fetcher, *, refresh: bool = False) -> Dict[str, Any]:
    path = cache_path(kind, key)
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding='utf-8'))
    payload = fetcher()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding='utf-8')
    return payload


def gmail_list_messages(q: str, account: str, *, refresh: bool = False, page_size: int = 500) -> List[Dict[str, Any]]:
    messages: List[Dict[str, Any]] = []
    page_token = ''
    page = 0
    while True:
        params = {'q': q, 'maxResults': str(page_size)}
        if page_token:
            params['pageToken'] = page_token
        url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?' + urllib.parse.urlencode(params)
        key = json.dumps({'account': account, 'q': q, 'pageToken': page_token, 'pageSize': page_size}, sort_keys=True)
        payload = cached_json('list-pages', key, lambda url=url: request_json(url, account), refresh=refresh)
        messages.extend(payload.get('messages', []) or [])
        page_token = payload.get('nextPageToken') or ''
        page += 1
        if not page_token:
            break
    return messages


def gmail_get_message(message_id: str, account: str, *, refresh: bool = False) -> Dict[str, Any]:
    cache_key = message_id
    if ':' in message_id:
        maybe_account, raw_id = message_id.split(':', 1)
        if '@' in maybe_account:
            message_id = raw_id
    params = [
        ('format', 'metadata'),
        ('metadataHeaders', 'From'),
        ('metadataHeaders', 'To'),
        ('metadataHeaders', 'Cc'),
        ('metadataHeaders', 'Bcc'),
        ('metadataHeaders', 'Subject'),
        ('metadataHeaders', 'Date'),
        ('metadataHeaders', 'Message-ID'),
        ('metadataHeaders', 'In-Reply-To'),
        ('metadataHeaders', 'References'),
    ]
    url = f'https://gmail.googleapis.com/gmail/v1/users/me/messages/{urllib.parse.quote(message_id)}?' + urllib.parse.urlencode(params)
    return cached_json('messages', cache_key, lambda: request_json(url, account), refresh=refresh)


def build_sent_events_for_account(account: str, start: dt.date, end: dt.date, *, refresh: bool = False, exclude_response_threads: Optional[set[str]] = None) -> tuple[List[Dict[str, Any]], Dict[str, int], int]:
    # Gmail's after/before operators are date-boundary based. Use smaller
    # windows so broad legacy-mailbox searches don't stall.
    windows: List[tuple[dt.date, dt.date]] = []
    cursor = start
    while cursor <= end:
        next_month = (cursor.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        window_end = min(end, next_month - dt.timedelta(days=1))
        windows.append((cursor, window_end))
        cursor = window_end + dt.timedelta(days=1)
    queries: List[str] = []
    for win_start, win_end in windows:
        after = (win_start - dt.timedelta(days=1)).strftime('%Y/%m/%d')
        before = (win_end + dt.timedelta(days=1)).strftime('%Y/%m/%d')
        queries.extend([
            f'in:sent after:{after} before:{before} subject:Regarding',
            f'in:sent after:{after} before:{before} subject:"Re:"',
            f'in:sent after:{after} before:{before} subject:"Final follow-up"',
            f'in:sent after:{after} before:{before} subject:"Final follow up"',
        ])
    hits: Dict[str, Dict[str, Any]] = {}
    query_counts: Dict[str, int] = {}
    for q in queries:
        print(f'Gmail search [{account}]: {q}', flush=True)
        found = gmail_list_messages(q, account, refresh=refresh)
        query_counts[q] = len(found)
        for hit in found:
            if hit.get('id'):
                hits[hit['id']] = hit

    events: List[Dict[str, Any]] = []
    rejected = 0

    # Warm the OAuth token before worker threads start; all subsequent calls reuse it.
    token(account)

    def to_event(msg_id: str) -> tuple[Optional[Dict[str, Any]], bool]:
        full = gmail_get_message(f'{account}:{msg_id}', account, refresh=refresh)
        headers = header_map(full)
        subject = headers.get('subject', '')
        event_type = classify_sent_subject(subject)
        ts = iso_from_internal_date(full.get('internalDate')) or (parse_date(headers.get('date', '')) or dt.datetime.min.replace(tzinfo=dt.timezone.utc)).isoformat()
        if not event_type or not date_in_range(ts, start, end):
            return None, True
        if event_type == 'sent_followup1' and exclude_response_threads and str(full.get('threadId') or '') in exclude_response_threads:
            return None, True
        tos = split_addresses(headers.get('to', ''))
        ccs = split_addresses(headers.get('cc', ''))
        bccs = split_addresses(headers.get('bcc', ''))
        return {
            'eventId': f'gmail-sent:{account}:{msg_id}',
            'eventType': event_type,
            'eventDate': ts,
            'source': 'gmail_sent',
            'account': account,
            'gmailMessageId': msg_id,
            'gmailThreadId': full.get('threadId', ''),
            'rfc822MessageId': headers.get('message-id', ''),
            'inReplyTo': headers.get('in-reply-to', ''),
            'references': headers.get('references', ''),
            'from': headers.get('from', ''),
            'to': tos,
            'cc': ccs,
            'bcc': bccs,
            'recipientEmails': sorted(set(tos + ccs + bccs)),
            'subject': subject,
            'snippet': full.get('snippet', ''),
            'labelIds': full.get('labelIds', []),
        }, False

    msg_ids = sorted(hits)
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        future_map = {executor.submit(to_event, msg_id): msg_id for msg_id in msg_ids}
        for future in concurrent.futures.as_completed(future_map):
            event, was_rejected = future.result()
            completed += 1
            if event:
                events.append(event)
            if was_rejected:
                rejected += 1
            if completed % 500 == 0 or completed == len(msg_ids):
                print(f'Fetched Gmail metadata {completed}/{len(msg_ids)}...', flush=True)
    return events, query_counts, rejected



def build_sent_events(start: dt.date, end: dt.date, *, refresh: bool = False, exclude_response_threads: Optional[set[str]] = None) -> List[Dict[str, Any]]:
    all_events: List[Dict[str, Any]] = []
    all_query_counts: Dict[str, int] = {}
    total_rejected = 0
    for account in SENT_ACCOUNTS:
        events, query_counts, rejected = build_sent_events_for_account(account, start, end, refresh=refresh, exclude_response_threads=exclude_response_threads)
        all_events.extend(events)
        for query, count in query_counts.items():
            all_query_counts[f'{account} :: {query}'] = count
        total_rejected += rejected
    deduped: Dict[str, Dict[str, Any]] = {}
    for event in all_events:
        key = event.get('rfc822MessageId') or event.get('eventId')
        key = str(key).strip() or str(event.get('eventId'))
        # Prefer the current Dave mailbox if the same RFC822 message appears in both.
        existing = deduped.get(key)
        if not existing or existing.get('account') != runner.SEND_ACCOUNT:
            deduped[key] = event
    build_sent_events.last_query_counts = all_query_counts  # type: ignore[attr-defined]
    build_sent_events.last_rejected_count = total_rejected  # type: ignore[attr-defined]
    build_sent_events.last_raw_count = len(all_events)  # type: ignore[attr-defined]
    build_sent_events.last_deduped_count = len(deduped)  # type: ignore[attr-defined]
    return list(deduped.values())

def response_event_type(value: str) -> str:
    clean = (value or '').strip().lower().replace(' ', '_')
    if clean in {'valid', 'possible_work'}:
        return 'inbound_real_person_response'
    if 'bounce' in clean:
        return 'inbound_bounce'
    if 'automatic' in clean or 'auto' in clean or 'office' in clean:
        return 'inbound_automatic_reply'
    return 'inbound_response'


def build_response_log_events(start: dt.date, end: dt.date) -> List[Dict[str, Any]]:
    rows = runner.sheet_get(runner.RESPONSE_RANGE)
    events: List[Dict[str, Any]] = []
    for idx, row in enumerate(rows, start=1):
        padded = list(row) + [''] * 9
        # Header-safe: skip rows without a parseable received date.
        parsed = parse_date(str(padded[runner.RESPONSE_RECEIVED_DATE]))
        if not parsed or not (start <= parsed.date() <= end):
            continue
        email_addr = norm_email(str(padded[runner.RESPONSE_EMAIL]))
        thread_id = str(padded[runner.RESPONSE_THREAD_ID]).strip()
        rtype = str(padded[runner.RESPONSE_TYPE]).strip()
        subject = str(padded[runner.RESPONSE_SUBJECT]).strip()
        events.append({
            'eventId': f'response-log:{idx}:{thread_id or email_addr}:{parsed.date().isoformat()}',
            'eventType': response_event_type(rtype),
            'eventDate': parsed.isoformat(),
            'source': 'response_log',
            'sheetRow': idx,
            'email': email_addr,
            'responseType': rtype,
            'gmailThreadId': thread_id,
            'sender': str(padded[runner.RESPONSE_SENDER]).strip(),
            'subject': subject,
            'snippet': str(padded[runner.RESPONSE_SNIPPET]).strip(),
            'projects': str(padded[runner.RESPONSE_PROJECTS]).strip(),
            'notes': str(padded[runner.RESPONSE_NOTES]).strip(),
        })
    build_response_log_events.last_rows_read = len(rows)  # type: ignore[attr-defined]
    return events


def load_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return {}


def count_by(items: Iterable[Dict[str, Any]], key: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in items:
        value = str(item.get(key) or '')
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def unique_threads(events: Iterable[Dict[str, Any]], event_types: set[str]) -> int:
    seen = set()
    for event in events:
        if event.get('eventType') not in event_types:
            continue
        key = event.get('gmailThreadId') or event.get('eventId')
        seen.add(str(key))
    return len(seen)


def validation_summary(sent_events: List[Dict[str, Any]], response_events: List[Dict[str, Any]]) -> Dict[str, Any]:
    marketing = load_json(MARKETING_STATS_PATH)
    snapshot = load_json(CAMPAIGN_SNAPSHOT_PATH)
    sent_counts = count_by(sent_events, 'eventType')
    response_counts = count_by(response_events, 'eventType')
    snapshot_cutoff = dt.date(2026, 5, 19)
    snapshot_window_events = [
        event for event in sent_events
        if (parse_date(str(event.get('eventDate') or '')) or dt.datetime.max.replace(tzinfo=dt.timezone.utc)).date() <= snapshot_cutoff
    ]
    snapshot_window_counts = count_by(snapshot_window_events, 'eventType')
    actual = {
        'initialEmails': sent_counts.get('sent_initial', 0),
        'followup1Emails': sent_counts.get('sent_followup1', 0),
        'finalFollowupEmails': sent_counts.get('sent_final_followup', 0),
        'autoFollowups': sent_counts.get('sent_followup1', 0) + sent_counts.get('sent_final_followup', 0),
        'realPersonResponseThreads': unique_threads(response_events, {'inbound_real_person_response'}),
    }
    actual_snapshot_window = {
        'sentOutreachRows': len(snapshot_window_events),
        'initialEmails': snapshot_window_counts.get('sent_initial', 0),
        'followup1Emails': snapshot_window_counts.get('sent_followup1', 0),
        'finalFollowupEmails': snapshot_window_counts.get('sent_final_followup', 0),
    }
    expected = {
        'marketingStats': {
            'initialEmails': marketing.get('summary', {}).get('initialEmails'),
            'followup1Emails': marketing.get('summary', {}).get('followup1Emails'),
            'finalFollowupEmails': marketing.get('summary', {}).get('finalFollowupEmails'),
            'autoFollowups': marketing.get('summary', {}).get('autoFollowups'),
            'realPersonResponseThreads': marketing.get('rows', {}).get('realPersonResponseThreads'),
        },
        'snapshot20260519': {
            'sentOutreachRows': snapshot.get('sent_outreach_rows'),
            'templateCounts': dict(snapshot.get('template_counts') or []),
            'stageCounts': dict(snapshot.get('stage_counts') or []),
            'uniqueSentEmailAddresses': snapshot.get('unique_sent_email_addresses'),
        },
    }
    diffs = {}
    for metric, value in actual.items():
        expected_value = expected['marketingStats'].get(metric)
        if isinstance(expected_value, int):
            diffs[metric] = value - expected_value
    snapshot_diffs = {}
    snapshot_template_counts = expected['snapshot20260519'].get('templateCounts') or {}
    if isinstance(expected['snapshot20260519'].get('sentOutreachRows'), int):
        snapshot_diffs['sentOutreachRows'] = actual_snapshot_window['sentOutreachRows'] - expected['snapshot20260519']['sentOutreachRows']
    if isinstance(snapshot_template_counts.get('template1'), int):
        snapshot_diffs['initialEmails'] = actual_snapshot_window['initialEmails'] - snapshot_template_counts['template1']
    if isinstance(snapshot_template_counts.get('template2'), int):
        snapshot_diffs['followup1Emails'] = actual_snapshot_window['followup1Emails'] - snapshot_template_counts['template2']
    return {
        'actualLedgerCounts': actual,
        'actualLedgerCountsThrough20260519': actual_snapshot_window,
        'expectedCounts': expected,
        'differenceVsMarketingStats': diffs,
        'differenceVs20260519Snapshot': snapshot_diffs,
    }


def write_events(events: List[Dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with EVENTS_PATH.open('w', encoding='utf-8') as fh:
        for event in events:
            fh.write(json.dumps(event, sort_keys=True) + '\n')


def main() -> int:
    parser = argparse.ArgumentParser(description='Rebuild read-only PlanHubGuy campaign ledger.')
    parser.add_argument('--start', default=DEFAULT_START.isoformat())
    parser.add_argument('--end', default=DEFAULT_END.isoformat())
    parser.add_argument('--refresh-cache', action='store_true', help='Re-fetch Gmail API pages/messages instead of using local cache.')
    args = parser.parse_args()

    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)
    if end < start:
        raise SystemExit('end must be >= start')

    print(f'Building PlanHubGuy ledger from {start} to {end}...', flush=True)
    response_events = build_response_log_events(start, end)
    response_threads = {str(e.get('gmailThreadId') or '') for e in response_events if e.get('gmailThreadId')}
    print(f'Response Log events: {len(response_events)}', flush=True)
    sent_events = build_sent_events(start, end, refresh=args.refresh_cache, exclude_response_threads=response_threads)
    print(f'Gmail sent events: {len(sent_events)}', flush=True)

    all_events = sorted(sent_events + response_events, key=lambda e: (e.get('eventDate') or '', e.get('eventId') or ''))
    write_events(all_events)

    sent_counts = count_by(sent_events, 'eventType')
    response_counts = count_by(response_events, 'eventType')
    summary = {
        'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'dateRange': {'start': start.isoformat(), 'end': end.isoformat()},
        'readOnly': True,
        'sources': {
            'gmailSentAccounts': SENT_ACCOUNTS,
            'responseSheetRange': runner.RESPONSE_RANGE,
            'gmailSearchQueries': getattr(build_sent_events, 'last_query_counts', {}),
            'gmailSearchRejectedAfterClassification': getattr(build_sent_events, 'last_rejected_count', 0),
            'gmailSentRawEventsBeforeDedupe': getattr(build_sent_events, 'last_raw_count', 0),
            'gmailSentEventsAfterDedupe': getattr(build_sent_events, 'last_deduped_count', 0),
            'cacheDir': str(CACHE_DIR.relative_to(ROOT)),
        },
        'outputs': {
            'eventsJsonl': str(EVENTS_PATH.relative_to(ROOT)),
            'summaryJson': str(SUMMARY_PATH.relative_to(ROOT)),
        },
        'counts': {
            'totalEvents': len(all_events),
            'sentEvents': len(sent_events),
            'responseEvents': len(response_events),
            'sentByType': sent_counts,
            'responsesByType': response_counts,
            'uniqueSentRecipients': len({addr for e in sent_events for addr in e.get('recipientEmails', [])}),
            'uniqueSentThreads': len({e.get('gmailThreadId') for e in sent_events if e.get('gmailThreadId')}),
            'uniqueRealPersonResponseThreads': unique_threads(response_events, {'inbound_real_person_response'}),
        },
        'validation': validation_summary(sent_events, response_events),
        'notes': [
            'Gmail sent events are immutable mailbox evidence and are deduped by Gmail message id.',
            'Inbound events currently use Response Log rows; row/thread dedupe is reported for real-person response threads.',
            'This script does not send email, change labels, or write Google Sheets.',
        ],
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, sort_keys=True), encoding='utf-8')
    print(f'Wrote {EVENTS_PATH}', flush=True)
    print(f'Wrote {SUMMARY_PATH}', flush=True)
    print(json.dumps(summary['counts'], indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
