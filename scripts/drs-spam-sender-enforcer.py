#!/usr/bin/env python3
"""Move DRS inbox mail from reviewed spam senders into Gmail Spam.

Gmail filters cannot add the system SPAM label, so this script enforces Dave's
rule by periodically scanning DRS@DRS-Engineering.net for messages from senders
already reviewed in the Spam folder and moving those inbox messages to Spam.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path('/home/davesalter/.openclaw/workspace')
ACCOUNT = 'DRS@DRS-Engineering.net'
SENDERS_PATH = ROOT / 'state' / 'drs-reviewed-spam-senders.json'
LOG_PATH = ROOT / 'memory' / 'email-cleanup' / 'drs-spam-sender-enforcer.jsonl'
GOG = '/usr/local/bin/gog'


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault('PATH', '/home/davesalter/.npm-global/bin:/usr/local/bin:/usr/bin:/bin')
    env.setdefault('GOG_KEYRING_PASSWORD', '')
    return subprocess.run(cmd, text=True, capture_output=True, check=False, env=env)


def append_log(row: dict[str, Any]) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open('a', encoding='utf-8') as f:
        f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')


def chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def load_senders() -> list[str]:
    data = json.loads(SENDERS_PATH.read_text())
    return sorted({str(item).strip().lower() for item in data.get('senders', []) if str(item).strip()})


def search_query(sender_chunk: list[str], newer_than: str) -> str:
    sender_query = '(' + ' OR '.join(f'from:{sender}' for sender in sender_chunk) + ')'
    return f'in:inbox newer_than:{newer_than} {sender_query}'


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--newer-than', default='30d')
    parser.add_argument('--max-per-chunk', type=int, default=100)
    args = parser.parse_args()

    now = datetime.now(timezone.utc).isoformat()
    senders = load_senders()
    matched_messages: list[dict[str, Any]] = []
    errors: list[str] = []

    for sender_chunk in chunks(senders, 20):
        query = search_query(sender_chunk, args.newer_than)
        search_cmd = [
            GOG, 'gmail', 'messages', 'search', query,
            '--account', ACCOUNT,
            '--max', str(args.max_per_chunk),
            '--json', '--no-input',
        ]
        res = run(search_cmd)
        if res.returncode != 0:
            errors.append(res.stderr.strip() or res.stdout.strip() or f'search failed for {query}')
            continue
        try:
            messages = json.loads(res.stdout).get('messages') or []
        except json.JSONDecodeError as exc:
            errors.append(f'bad search JSON for {query}: {exc}')
            continue
        matched_messages.extend(messages)

    # de-dupe by Gmail message ID
    deduped = {m.get('id'): m for m in matched_messages if m.get('id')}
    ids = sorted(deduped)
    moved = 0

    if ids and not args.dry_run:
        for id_chunk in chunks(ids, 100):
            cmd = [
                GOG, 'gmail', 'batch', 'modify', *id_chunk,
                '--account', ACCOUNT,
                '--add', 'SPAM',
                '--remove', 'INBOX',
                '--json', '--no-input', '--force',
            ]
            res = run(cmd)
            if res.returncode == 0:
                moved += len(id_chunk)
            else:
                errors.append(res.stderr.strip() or res.stdout.strip() or 'batch modify failed')

    append_log({
        'at': now,
        'account': ACCOUNT,
        'dryRun': args.dry_run,
        'senderCount': len(senders),
        'matched': len(ids),
        'movedToSpam': 0 if args.dry_run else moved,
        'examples': [
            {
                'id': m.get('id'),
                'from': m.get('from'),
                'subject': m.get('subject'),
                'date': m.get('date'),
            }
            for m in list(deduped.values())[:25]
        ],
        'ok': not errors,
        'errors': errors,
    })
    print(json.dumps({'dryRun': args.dry_run, 'senderCount': len(senders), 'matched': len(ids), 'movedToSpam': 0 if args.dry_run else moved, 'ok': not errors}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == '__main__':
    raise SystemExit(main())
