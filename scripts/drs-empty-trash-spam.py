#!/usr/bin/env python3
"""Permanently empty Trash and Spam for DRS@DRS-Engineering.net.

Safety constraints:
- Only operates on DRS@DRS-Engineering.net.
- Only permanently deletes messages currently in Trash or Spam.
- Intended for a biweekly cron job.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ACCOUNT = "DRS@DRS-Engineering.net"
QUERIES = ["in:trash", "in:spam"]
ROOT = Path("/home/davesalter/.openclaw/workspace")
LOG_DIR = ROOT / "memory" / "email-cleanup"
RUN_LOG = LOG_DIR / "drs-empty-trash-spam-runs.jsonl"
DELETE_LOG = LOG_DIR / "drs-empty-trash-spam-deleted.jsonl"


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def append_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def search(query: str, max_messages: int) -> list[dict[str, Any]]:
    cmd = [
        "gog", "gmail", "messages", "search", query,
        "--account", ACCOUNT,
        "--max", str(max_messages),
        "--json", "--no-input",
    ]
    res = run(cmd)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip() or f"search failed: {query}")
    data = json.loads(res.stdout)
    return data.get("messages") or []


def delete_ids(ids: list[str]) -> int:
    deleted = 0
    for batch in chunked(ids, 100):
        cmd = ["gog", "gmail", "batch", "delete", *batch, "--account", ACCOUNT, "--force", "--no-input", "--json"]
        res = run(cmd)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or res.stdout.strip() or "batch delete failed")
        deleted += len(batch)
    return deleted


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-per-query", type=int, default=1000)
    parser.add_argument(
        "--biweekly-anchor",
        default=None,
        help="YYYY-MM-DD local date. If set, skip unless today is a 14-day interval from this date.",
    )
    args = parser.parse_args()

    now = datetime.now(timezone.utc).isoformat()
    if args.biweekly_anchor:
        local_today = datetime.now(ZoneInfo("America/Los_Angeles")).date()
        anchor = date.fromisoformat(args.biweekly_anchor)
        days = (local_today - anchor).days
        if days < 0 or days % 14 != 0:
            append_jsonl(RUN_LOG, [{
                "at": now,
                "account": ACCOUNT,
                "queries": QUERIES,
                "dryRun": args.dry_run,
                "skipped": True,
                "reason": "not scheduled biweekly run date",
                "localDate": local_today.isoformat(),
                "anchorDate": anchor.isoformat(),
                "ok": True,
            }])
            print(json.dumps({
                "account": ACCOUNT,
                "skipped": True,
                "reason": "not scheduled biweekly run date",
                "localDate": local_today.isoformat(),
                "anchorDate": anchor.isoformat(),
                "ok": True,
            }, ensure_ascii=False))
            return 0
    seen: set[str] = set()
    all_rows: list[dict[str, Any]] = []
    matched_total = 0
    deleted_total = 0

    try:
        for query in QUERIES:
            # Real runs keep looping until the mailbox is empty for this query.
            # Dry-runs sample one page so they do not spend ages enumerating old trash.
            while True:
                messages = search(query, args.max_per_query)
                if not messages:
                    break

                ids: list[str] = []
                rows: list[dict[str, Any]] = []
                for msg in messages:
                    mid = msg.get("id")
                    if not mid or mid in seen:
                        continue
                    seen.add(mid)
                    ids.append(mid)
                    rows.append({
                        "deletedAt": now,
                        "account": ACCOUNT,
                        "sourceQuery": query,
                        "dryRun": args.dry_run,
                        "messageId": mid,
                        "threadId": msg.get("threadId"),
                        "date": msg.get("date"),
                        "from": msg.get("from"),
                        "subject": msg.get("subject"),
                        "labels": msg.get("labels", []),
                    })

                if not ids:
                    break

                matched_total += len(ids)
                all_rows.extend(rows)
                if args.dry_run:
                    break
                deleted_total += delete_ids(ids)

        append_jsonl(DELETE_LOG, all_rows)
        append_jsonl(RUN_LOG, [{
            "at": now,
            "account": ACCOUNT,
            "queries": QUERIES,
            "dryRun": args.dry_run,
            "matched": matched_total,
            "permanentlyDeleted": deleted_total,
            "ok": True,
        }])
        print(json.dumps({
            "account": ACCOUNT,
            "queries": QUERIES,
            "dryRun": args.dry_run,
            "matched": matched_total,
            "permanentlyDeleted": deleted_total,
            "ok": True,
        }, ensure_ascii=False))
        return 0
    except Exception as exc:
        append_jsonl(RUN_LOG, [{
            "at": now,
            "account": ACCOUNT,
            "queries": QUERIES,
            "dryRun": args.dry_run,
            "ok": False,
            "error": str(exc),
        }])
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
