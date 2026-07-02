#!/usr/bin/env python3
from pathlib import Path

from planhubguy_inbound_audit_lib import mailbox_valid_reply_audit, write_json

OUT = Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-mailbox-valid-reply-audit.json')


def main():
    summary = mailbox_valid_reply_audit()
    write_json(OUT, summary)
    print(__import__('json').dumps(summary, indent=2, default=str))


if __name__ == '__main__':
    main()
