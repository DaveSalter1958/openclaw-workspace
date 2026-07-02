#!/usr/bin/env python3
"""Audit PlanHubGuy Follow up queue against Gmail sent evidence.

Read-only. Uses targeted Gmail searches for each queued sender in both DRS mailboxes.
"""
import datetime as dt
import email.utils
import importlib.util
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
RUNNER_PATH = SCRIPT_DIR / 'planhubguy-runner.py'
spec = importlib.util.spec_from_file_location('planhubguy_runner', RUNNER_PATH)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)  # type: ignore[attr-defined]

QUEUE_PATH = SCRIPT_DIR / 'tmp' / 'planhubguy-followup-queue-before.json'
OUT_PATH = SCRIPT_DIR / 'tmp' / 'planhubguy-followup-audit.json'
ACCOUNTS = ['drs@drs-engineering.net', 'Dave@DRS-Engineering.net']
SINCE_QUERY = 'newer_than:14d'
TOKEN_CACHE = {}


def access_token(account):
    if account not in TOKEN_CACHE:
        TOKEN_CACHE[account] = runner.gmail_access_token(account)
    return TOKEN_CACHE[account]


def api(account, path, params=None):
    token = access_token(account)
    url = 'https://gmail.googleapis.com/gmail/v1/users/me/' + path
    if params:
        url += '?' + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'}, method='GET')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def headers_map(message):
    headers = (message.get('payload') or {}).get('headers') or []
    return {(h.get('name') or '').lower(): h.get('value') or '' for h in headers}


def parse_date(value):
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except Exception:
        return None


def sent_hits_for(account, email_addr):
    q = f'in:sent {SINCE_QUERY} to:{email_addr}'
    payload = api(account, 'messages', {'q': q, 'maxResults': '10'})
    out = []
    for hit in payload.get('messages', []) or []:
        mid = hit.get('id')
        if not mid:
            continue
        meta = api(account, f'messages/{mid}', {'format': 'metadata', 'metadataHeaders': ['From','To','Cc','Bcc','Subject','Date','Message-ID','In-Reply-To','References']})
        h = headers_map(meta)
        out.append({
            'account': account,
            'id': mid,
            'threadId': meta.get('threadId', hit.get('threadId','')),
            'date': h.get('date',''),
            'dateUtc': parse_date(h.get('date','')).isoformat() if parse_date(h.get('date','')) else '',
            'from': h.get('from',''),
            'to': h.get('to',''),
            'cc': h.get('cc',''),
            'bcc': h.get('bcc',''),
            'subject': h.get('subject',''),
            'inReplyTo': h.get('in-reply-to',''),
            'references': h.get('references',''),
        })
        time.sleep(0.01)
    return out


def main():
    queue = json.loads(QUEUE_PATH.read_text())
    items = queue.get('items', [])
    print(f'Queue items: {len(items)}', file=sys.stderr, flush=True)
    responded = []
    unresolved = []
    sent_count = 0
    for idx, item in enumerate(items, 1):
        email_addr = (item.get('fromEmail') or '').lower().strip()
        item_dt = parse_date(item.get('date') or '')
        matches = []
        if email_addr:
            for account in ACCOUNTS:
                try:
                    for msg in sent_hits_for(account, email_addr):
                        sent_count += 1
                        msg_dt = parse_date(msg.get('date') or '')
                        if item_dt and msg_dt and msg_dt < item_dt:
                            continue
                        matches.append(msg)
                except Exception as exc:
                    matches.append({'account': account, 'error': str(exc), 'to': email_addr})
        record = {'queueItem': item, 'sentMatches': matches}
        if matches and not all('error' in m for m in matches):
            responded.append(record)
        else:
            unresolved.append(record)
        if idx % 20 == 0:
            print(f'Checked {idx}/{len(items)}; responded evidence {len(responded)}', file=sys.stderr, flush=True)
    report = {
        'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'sinceQuery': SINCE_QUERY,
        'queueCount': len(items),
        'sentHitCount': sent_count,
        'respondedEvidenceCount': len(responded),
        'unresolvedCount': len(unresolved),
        'respondedEvidence': responded,
        'unresolved': unresolved,
    }
    OUT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ['generatedAt','queueCount','sentHitCount','respondedEvidenceCount','unresolvedCount']}, indent=2))

if __name__ == '__main__':
    main()
