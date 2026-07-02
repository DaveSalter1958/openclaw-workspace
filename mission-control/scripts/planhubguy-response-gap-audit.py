#!/usr/bin/env python3
from pathlib import Path

from planhubguy_inbound_audit_lib import read_json, response_log_valid_rows, write_json

MAILBOX_AUDIT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-mailbox-valid-reply-audit.json')
OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-response-gap-audit.json')


def main():
    mailbox = read_json(MAILBOX_AUDIT)
    external = mailbox.get('externalValidSample', [])
    valid_rows, existing_keys, existing_semantic_keys = response_log_valid_rows()

    missing = []
    present = 0
    present_semantic = 0
    for item in external:
        email = (item.get('senderEmail') or '').strip().lower()
        thread = (item.get('threadId') or '').strip()
        subject = (item.get('subject') or '').strip()
        key = (email, thread, subject)
        semantic_key = (email, subject)
        if key in existing_keys:
            present += 1
        else:
            missing.append(item)
        if semantic_key in existing_semantic_keys:
            present_semantic += 1

    summary = {
        'responseLogValidCount': len(valid_rows),
        'mailboxExternalSampleCountUsed': len(external),
        'presentCount': present,
        'presentSemanticCount': present_semantic,
        'missingCount': len(missing),
        'missingSample': missing[:100],
    }
    write_json(OUT, summary)
    print(__import__('json').dumps(summary, indent=2, default=str))


if __name__ == '__main__':
    main()
