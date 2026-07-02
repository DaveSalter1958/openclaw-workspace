#!/usr/bin/env python3
import sys
from pathlib import Path

from planhubguy_inbound_audit_lib import (
    classify_message,
    fetch_message_by_sender_subject,
    read_json,
    response_log_valid_rows,
    sheet_append,
    write_json,
)

GAP_AUDIT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-response-gap-audit.json')
OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-response-backfill-missing-summary.json')


def main():
    apply_changes = '--apply' in sys.argv
    gap = read_json(GAP_AUDIT)
    missing = gap.get('missingSample', [])
    _, existing_keys, _ = response_log_valid_rows()

    to_append = []
    found = []
    skipped = []
    for item in missing:
        sender = (item.get('senderEmail') or '').strip().lower()
        subject = (item.get('subject') or '').strip()
        infos = fetch_message_by_sender_subject(sender, subject)
        if not infos:
            skipped.append({'reason': 'not_found', 'senderEmail': sender, 'subject': subject})
            continue
        appended_for_pair = False
        for info in infos:
            response_type = classify_message(info)
            key = (sender, info.get('threadId', '').strip(), info.get('subject', '').strip())
            if key in existing_keys:
                skipped.append({'reason': 'already_present', 'senderEmail': sender, 'subject': subject, 'threadId': info.get('threadId', '')})
                continue
            row = [
                sender,
                '2026-04-28',
                response_type,
                info.get('threadId', ''),
                info.get('from', ''),
                info.get('subject', ''),
                info.get('snippet', ''),
                '',
                'PlanHubGuy targeted backfill',
            ]
            to_append.append(row)
            found.append({'senderEmail': sender, 'subject': subject, 'threadId': info.get('threadId', ''), 'responseType': response_type})
            existing_keys.add(key)
            appended_for_pair = True
        if not appended_for_pair and infos:
            skipped.append({'reason': 'all_matches_already_present', 'senderEmail': sender, 'subject': subject})

    summary = {
        'missingInputCount': len(missing),
        'appendCandidateCount': len(to_append),
        'foundCount': len(found),
        'skippedCount': len(skipped),
        'foundSample': found[:50],
        'skippedSample': skipped[:50],
    }
    write_json(OUT, summary)
    print(__import__('json').dumps(summary, indent=2, default=str))
    if apply_changes and to_append:
        sheet_append('Response Log!A:I', to_append)


if __name__ == '__main__':
    main()
