#!/usr/bin/env python3
"""Write a daily audit report for DRS email automation."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path("/home/davesalter/.openclaw/workspace")
LOG_DIR = ROOT / "memory" / "email-cleanup"
REPORT_DIR = LOG_DIR / "reports"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(errors="replace").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def recent(rows: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    return rows[-limit:]


def main() -> int:
    now = datetime.now(timezone.utc)
    day = now.date().isoformat()
    triage_runs = read_jsonl(LOG_DIR / "drs-marketing-junk-triage-runs.jsonl")
    cleanup_runs = read_jsonl(LOG_DIR / "drs-marketing-junk-runs.jsonl")
    spam_runs = read_jsonl(LOG_DIR / "drs-spam-sender-enforcer.jsonl")
    feedback = read_jsonl(ROOT / "state" / "email-task-feedback.jsonl")
    task_state_path = ROOT / "state" / "email-to-notion-tasks.json"
    task_state = json.loads(task_state_path.read_text()) if task_state_path.exists() else {}

    report = {
        "generatedAt": now.isoformat(),
        "date": day,
        "marketingTriageRecentRuns": recent(triage_runs, 5),
        "marketingCleanupRecentRuns": recent(cleanup_runs, 5),
        "spamSenderEnforcerRecentRuns": recent(spam_runs, 5),
        "recentEmailTaskFeedback": recent(feedback, 20),
        "emailTaskState": {
            "processedCount": len(task_state.get("processed", {})),
            "createdCount": len(task_state.get("created", [])),
            "recentCreated": recent(task_state.get("created", []), 10),
        },
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    out = REPORT_DIR / f"{day}-drs-email-review-report.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    print(json.dumps({"ok": True, "out": str(out)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
