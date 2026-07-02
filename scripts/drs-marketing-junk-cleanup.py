#!/usr/bin/env python3
"""Move Dave-classified DRS marketing junk to Trash and log examples.

This intentionally only touches DRS@DRS-Engineering.net and only messages Dave has
already labelled "Marketing Junk". It does not permanently delete mail.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ACCOUNT = "DRS@DRS-Engineering.net"
LABEL = "Marketing Junk"
QUERY = f'label:"{LABEL}" -in:trash'
MAX_MESSAGES = 500
ROOT = Path("/home/davesalter/.openclaw/workspace")
LOG_DIR = ROOT / "memory" / "email-cleanup"
LEARNING_LOG = LOG_DIR / "drs-marketing-junk-learning.jsonl"
RUN_LOG = LOG_DIR / "drs-marketing-junk-runs.jsonl"


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault("GOG_KEYRING_PASSWORD", "")
    return subprocess.run(cmd, text=True, capture_output=True, check=False, env=env)


def domain_from_sender(sender: str) -> str | None:
    match = re.search(r"<([^>]+)>", sender or "")
    email = match.group(1) if match else sender
    if "@" not in email:
        return None
    return email.split("@", 1)[1].strip().lower() or None


def append_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Log what would be trashed without changing Gmail")
    parser.add_argument("--max", type=int, default=MAX_MESSAGES)
    args = parser.parse_args()

    now = datetime.now(timezone.utc).isoformat()
    search_cmd = [
        "gog",
        "gmail",
        "messages",
        "search",
        QUERY,
        "--account",
        ACCOUNT,
        "--max",
        str(args.max),
        "--json",
        "--no-input",
    ]
    res = run(search_cmd)
    if res.returncode != 0:
        append_jsonl(RUN_LOG, [{"at": now, "account": ACCOUNT, "query": QUERY, "ok": False, "error": res.stderr.strip()}])
        print(res.stderr.strip() or res.stdout.strip(), file=sys.stderr)
        return res.returncode

    try:
        data = json.loads(res.stdout)
    except json.JSONDecodeError as exc:
        append_jsonl(RUN_LOG, [{"at": now, "account": ACCOUNT, "query": QUERY, "ok": False, "error": f"bad json: {exc}"}])
        print(f"Could not parse gog JSON: {exc}", file=sys.stderr)
        return 2

    messages = data.get("messages") or []
    ids = [m["id"] for m in messages if m.get("id")]

    learning_rows = []
    for m in messages:
        learning_rows.append(
            {
                "classifiedAt": now,
                "account": ACCOUNT,
                "sourceLabel": LABEL,
                "action": "would_trash" if args.dry_run else "trashed",
                "messageId": m.get("id"),
                "threadId": m.get("threadId"),
                "date": m.get("date"),
                "from": m.get("from"),
                "fromDomain": domain_from_sender(m.get("from", "")),
                "subject": m.get("subject"),
                "labels": m.get("labels", []),
            }
        )

    trashed = 0
    errors: list[str] = []
    if ids and not args.dry_run:
        for batch in chunked(ids, 100):
            trash_cmd = ["gog", "gmail", "trash", *batch, "--account", ACCOUNT, "--force", "--no-input", "--json"]
            tres = run(trash_cmd)
            if tres.returncode == 0:
                trashed += len(batch)
            else:
                errors.append(tres.stderr.strip() or tres.stdout.strip())

    append_jsonl(LEARNING_LOG, learning_rows)
    append_jsonl(
        RUN_LOG,
        [
            {
                "at": now,
                "account": ACCOUNT,
                "query": QUERY,
                "dryRun": args.dry_run,
                "matched": len(ids),
                "trashed": 0 if args.dry_run else trashed,
                "ok": not errors,
                "errors": errors,
            }
        ],
    )

    print(json.dumps({"account": ACCOUNT, "query": QUERY, "dryRun": args.dry_run, "matched": len(ids), "trashed": 0 if args.dry_run else trashed, "ok": not errors}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
