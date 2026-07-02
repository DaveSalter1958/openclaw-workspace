#!/usr/bin/env python3
"""Generate Mission Control PlanHubGuy statistics from the immutable campaign ledger.

This intentionally treats Dave@DRS-Engineering.net sent mail as real client outreach
and excludes legacy DRS outbound/test traffic plus internal DRS recipients.
"""
from __future__ import annotations

import collections
import datetime as dt
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVENTS_PATH = ROOT / 'data' / 'planhubguy' / 'campaign-events.jsonl'
SUMMARY_PATH = ROOT / 'data' / 'planhubguy' / 'campaign-ledger-summary.json'
OUT_PATH = ROOT / 'data' / 'planhubguy' / 'marketing-stats.json'
DATED_OUT_PATH = ROOT / 'scripts' / 'tmp' / f'planhubguy-marketing-stats-{dt.date.today():%Y%m%d}.json'
REAL_OUTREACH_ACCOUNT = 'Dave@DRS-Engineering.net'


def pct(count: int, denom: int) -> str:
    return '0.00%' if not denom else f'{(count / denom) * 100:.2f}%'


def is_internal_or_test(event: dict) -> bool:
    if event.get('account') != REAL_OUTREACH_ACCOUNT:
        return True
    recipients = [str(addr).lower() for addr in event.get('recipientEmails') or []]
    if recipients and all(addr.endswith('@drs-engineering.net') for addr in recipients):
        return True
    subject = str(event.get('subject') or '').lower()
    if re.search(r'\b(test|sample)\b', subject):
        return True
    return False


def load_events() -> list[dict]:
    events = []
    with EVENTS_PATH.open(encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def main() -> int:
    events = load_events()
    sent = [event for event in events if str(event.get('eventType') or '').startswith('sent_') and not is_internal_or_test(event)]
    inbound = [event for event in events if str(event.get('eventType') or '').startswith('inbound_')]

    sent_counts = collections.Counter(event.get('eventType') for event in sent)
    response_counts = collections.Counter(event.get('eventType') for event in inbound)

    unique_initial_contacts = {
        addr.lower()
        for event in sent
        if event.get('eventType') == 'sent_initial'
        for addr in event.get('recipientEmails') or []
    }
    unique_sent_contacts = {
        addr.lower()
        for event in sent
        for addr in event.get('recipientEmails') or []
    }
    real_person_threads = {
        event.get('gmailThreadId') or event.get('eventId')
        for event in inbound
        if event.get('eventType') == 'inbound_real_person_response'
    }

    initial = sent_counts['sent_initial']
    followup1 = sent_counts['sent_followup1']
    final_followup = sent_counts['sent_final_followup']
    auto_followups = followup1 + final_followup
    real_responses = len(real_person_threads)
    bounces = response_counts['inbound_bounce']
    automatic = response_counts['inbound_automatic_reply']
    denominator = len(unique_initial_contacts)

    all_dates = [str(event.get('eventDate') or '')[:10] for event in events if event.get('eventDate')]
    start = min(all_dates) if all_dates else '2026-04-01'
    end = max(all_dates) if all_dates else dt.date.today().isoformat()

    stats = [
        {'metric': 'Unique initial-outreach contacts', 'count': denominator, 'percent': '100.00%', 'note': 'Unique recipients of real initial client outreach from Dave@DRS-Engineering.net; legacy/test/internal traffic excluded.', 'emphasis': True},
        {'metric': 'Initial emails sent', 'count': initial, 'percent': pct(initial, denominator), 'note': 'Immutable Gmail Sent evidence from Dave@DRS-Engineering.net only; legacy DRS test traffic excluded.', 'emphasis': True},
        {'metric': 'Follow-up 1 emails sent', 'count': followup1, 'percent': pct(followup1, denominator), 'note': 'Immutable Gmail Sent evidence, excluding internal/test recipients.'},
        {'metric': 'Final follow-up emails sent', 'count': final_followup, 'percent': pct(final_followup, denominator), 'note': 'Immutable Gmail Sent evidence, excluding internal/test recipients.'},
        {'metric': 'Total auto follow-ups sent', 'count': auto_followups, 'percent': pct(auto_followups, denominator), 'note': 'Follow-up 1 plus final follow-up emails.'},
        {'metric': 'Real person responses received', 'count': real_responses, 'percent': pct(real_responses, denominator), 'note': 'Unique Response Log threads classified as valid or possible_work; excludes bounces, automatic replies, and system rows.', 'emphasis': True},
        {'metric': 'Bounces / undeliverable responses', 'count': bounces, 'percent': pct(bounces, denominator), 'note': 'Response Log bounce rows; not deduped by address.'},
        {'metric': 'Automatic replies', 'count': automatic, 'percent': pct(automatic, denominator), 'note': 'Response Log automatic/out-of-office rows.'},
        {'metric': 'Unique sent recipients across all real outreach', 'count': len(unique_sent_contacts), 'percent': pct(len(unique_sent_contacts), denominator), 'note': 'Unique recipients across initial, follow-up 1, and final follow-up messages.'},
    ]

    ledger_summary = {}
    if SUMMARY_PATH.exists():
        ledger_summary = json.loads(SUMMARY_PATH.read_text(encoding='utf-8'))

    report = {
        'dateRange': {'start': start, 'end': end},
        'source': 'Immutable PlanHubGuy campaign ledger: Dave@DRS-Engineering.net Gmail Sent + Response Log; legacy DRS/test/internal traffic excluded from outbound statistics',
        'basis': {
            'realOutreachSentAccount': REAL_OUTREACH_ACCOUNT,
            'excluded': ['legacy drs@drs-engineering.net outbound/testing traffic', 'internal @drs-engineering.net recipients', 'obvious test/sample subjects'],
            'eventsFile': str(EVENTS_PATH.relative_to(ROOT)),
        },
        'rows': {
            'sentEvents': len(sent),
            'initialRows': initial,
            'template1InitialEmails': initial,
            'followup1Emails': followup1,
            'finalFollowupEmails': final_followup,
            'autoFollowups': auto_followups,
            'responseRowsInRange': len(inbound),
            'realPersonResponseThreads': real_responses,
        },
        'summary': {
            'initialEmails': initial,
            'uniqueInitialContacts': denominator,
            'autoFollowups': auto_followups,
            'followup1Emails': followup1,
            'finalFollowupEmails': final_followup,
            'realPersonResponses': real_responses,
        },
        'stats': stats,
        'supportingCounts': {
            'sentByType': dict(sorted(sent_counts.items())),
            'responsesByType': dict(sorted(response_counts.items())),
            'uniqueSentContacts': len(unique_sent_contacts),
            'ledgerGeneratedAt': ledger_summary.get('generatedAt'),
        },
    }

    for path in (OUT_PATH, DATED_OUT_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'summary': report['summary'], 'rows': report['rows'], 'out': str(OUT_PATH)}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
