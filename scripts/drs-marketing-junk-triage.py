#!/usr/bin/env python3
"""Conservatively label obvious DRS marketing junk.

This script only touches DRS@DRS-Engineering.net. It labels obvious
promotional/solicitation mail as "Marketing Junk" and removes it from Inbox so
Dave can review that one label before the nightly cleanup moves it to Trash.
Uncertain mail is left alone.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from email.utils import parseaddr
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path("/home/davesalter/.openclaw/workspace")
ACCOUNT = "DRS@DRS-Engineering.net"
LABEL = "Marketing Junk"
LOG_DIR = ROOT / "memory" / "email-cleanup"
RUN_LOG = LOG_DIR / "drs-marketing-junk-triage-runs.jsonl"
DETAIL_LOG = LOG_DIR / "drs-marketing-junk-triage-decisions.jsonl"
LEARNING_LOG = LOG_DIR / "drs-marketing-junk-learning.jsonl"

GOG = "/usr/local/bin/gog"

SAFE_DOMAINS = {
    "drs-engineering.net",
    "gmail.com",
    "kimley-horn.com",
    "foundationpile.com",
    "dakotadrilling.us",
    "virtualhoa.com",
    "acrisure.com",
    "marcsbookkeeping.com",
    "naturetrack.org",
}

TRANSACTIONAL_LEARNING_DOMAINS = {
    "amazon.com",
    "google.com",
    "homedepot.com",
    "order.homedepot.com",
    "e.budget.com",
    "resnexus.com",
    "pge.com",
}

SAFE_SENDER_PATTERNS = [
    "linkedin",
    "usgs",
    "sb4wd",
    "santa barbara four",
    "naturetrack",
]

SAFE_SUBJECT_PATTERNS = [
    r"\brfi\b",
    r"\bproposal\b",
    r"\bquote\b",
    r"\bestimate\b",
    r"\binvoice\b",
    r"\bcontract\b",
    r"\bplans?\b",
    r"\bsubmittal\b",
    r"\bpermit\b",
    r"\bshoring\b",
    r"\bretaining wall\b",
    r"\bfoundation\b",
    r"\bsoil\b",
    r"\bproject\b",
    r"\bmeeting\b",
    r"\bcall\b",
    r"\bpayment\b",
    r"\bbank\b",
    r"\bsecurity alert\b",
    r"\bconfirmation\b",
    r"\border(?:ed)?\b",
    r"\bshipped\b",
    r"\bdelivered\b",
    r"\bmembership renews?\b",
    r"\bsubscription .* renew\b",
]

MARKETING_SENDER_PATTERNS = [
    "newsletter",
    "marketing@",
    "offers@",
    "events@",
    "webinar",
    "mailchimp",
    "constantcontact",
    "sendgrid",
    "campaign",
    "hubspot",
    "vrbo",
    "democrats.org",
    "republican",
    "zillow",
    "nextdoor",
    "performancegolf",
    "exceluniversity",
    "acadium",
    "aiadvantage",
    "mastermind",
]

MARKETING_SUBJECT_PATTERNS = [
    r"\bnewsletter\b",
    r"\bwebinar\b",
    r"\bregister now\b",
    r"\bsave your seat\b",
    r"\blast chance\b",
    r"\blimited[- ]time\b",
    r"\bspecial offer\b",
    r"\bexclusive\b",
    r"\bfree (?:trial|guide|download|webinar)\b",
    r"\bbook a demo\b",
    r"\bcase study\b",
    r"\bwhite ?paper\b",
    r"\bsubscribe\b",
    r"\bsale\b",
    r"\bdeal\b",
    r"\bpool homes await\b",
    r"\bwhat happened after we reached out\b",
]

MARKETING_BODY_PATTERNS = [
    r"\bunsubscribe\b",
    r"\bmanage (?:your )?(?:email )?preferences\b",
    r"\bview (?:this )?email in (?:your )?browser\b",
    r"\bregister now\b",
    r"\bsave your seat\b",
    r"\bbook (?:a|your) demo\b",
    r"\bdownload (?:our|the)\b",
    r"\blearn more\b",
]


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.setdefault("PATH", "/home/davesalter/.npm-global/bin:/usr/local/bin:/usr/bin:/bin")
    env.setdefault("GOG_KEYRING_PASSWORD", "")
    return subprocess.run(cmd, text=True, capture_output=True, check=False, env=env)


def append_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    value = re.sub(r"https?://\S+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip().lower()


def sender_email(sender: str) -> str:
    _, email = parseaddr(sender or "")
    return (email or sender or "").strip().lower()


def sender_domain(sender: str) -> str:
    email = sender_email(sender)
    return email.rsplit("@", 1)[-1] if "@" in email else ""


def any_re(patterns: list[str], text: str) -> bool:
    return any(re.search(pattern, text, re.I) for pattern in patterns)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(errors="replace").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


@lru_cache(maxsize=1)
def learned_marketing_sources() -> tuple[set[str], set[str]]:
    sender_counts: Counter[str] = Counter()
    domain_counts: Counter[str] = Counter()
    for row in read_jsonl(LEARNING_LOG)[-1000:]:
        if row.get("sourceLabel") != LABEL:
            continue
        if row.get("action") not in {"trashed", "would_trash"}:
            continue
        sender = sender_email(str(row.get("from") or ""))
        domain = str(row.get("fromDomain") or "").strip().lower()
        if sender:
            sender_counts[sender] += 1
        if domain and domain not in SAFE_DOMAINS and domain not in TRANSACTIONAL_LEARNING_DOMAINS:
            domain_counts[domain] += 1
    learned_senders = {sender for sender, count in sender_counts.items() if count >= 1}
    learned_domains = {domain for domain, count in domain_counts.items() if count >= 2}
    return learned_senders, learned_domains


def classify(message: dict[str, Any]) -> tuple[bool, list[str]]:
    sender = message.get("from") or ""
    subject = message.get("subject") or ""
    labels = {str(label).upper() for label in message.get("labels", [])}
    body = message.get("body") or message.get("snippet") or ""
    sender_l = sender.lower()
    subject_l = subject.lower()
    body_l = clean_text(body)
    reasons: list[str] = []

    domain = sender_domain(sender)
    learned_senders, learned_domains = learned_marketing_sources()
    if domain in SAFE_DOMAINS:
        return False, [f"safe_domain:{domain}"]
    if any(pattern in sender_l for pattern in SAFE_SENDER_PATTERNS):
        return False, ["safe_sender"]
    if any_re(SAFE_SUBJECT_PATTERNS, subject_l):
        return False, ["safe_subject"]

    score = 0
    if "CATEGORY_PROMOTIONS" in labels:
        score += 2
        reasons.append("gmail_promotions")
    if any(pattern in sender_l for pattern in MARKETING_SENDER_PATTERNS):
        score += 2
        reasons.append("marketing_sender")
    if any_re(MARKETING_SUBJECT_PATTERNS, subject_l):
        score += 2
        reasons.append("marketing_subject")
    if any_re(MARKETING_BODY_PATTERNS, body_l):
        score += 1
        reasons.append("marketing_body")
    if sender_email(sender) in learned_senders:
        score += 2
        reasons.append("learned_sender")
    if domain in learned_domains:
        score += 2
        reasons.append("learned_domain")

    # Require one strong signal. A plain unsubscribe footer is not enough.
    return score >= 2, reasons or ["insufficient_marketing_evidence"]


def search_messages(max_messages: int, newer_than: str) -> list[dict[str, Any]]:
    query = f'newer_than:{newer_than} in:inbox -label:"{LABEL}"'
    cmd = [
        GOG,
        "gmail",
        "messages",
        "search",
        query,
        "--account",
        ACCOUNT,
        "--max",
        str(max_messages),
        "--include-body",
        "--json",
        "--no-input",
    ]
    res = run(cmd)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip() or "gog search failed")
    return json.loads(res.stdout).get("messages") or []


def apply_marketing_junk(ids: list[str]) -> int:
    changed = 0
    for batch in chunks(ids, 100):
        cmd = [
            GOG,
            "gmail",
            "batch",
            "modify",
            *batch,
            "--account",
            ACCOUNT,
            "--add",
            LABEL,
            "--remove",
            "INBOX",
            "--json",
            "--no-input",
            "--force",
        ]
        res = run(cmd)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or res.stdout.strip() or "gog modify failed")
        changed += len(batch)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max", type=int, default=100)
    parser.add_argument("--newer-than", default="7d")
    args = parser.parse_args()

    now = datetime.now(timezone.utc).isoformat()
    try:
        messages = search_messages(args.max, args.newer_than)
        decisions: list[dict[str, Any]] = []
        junk_ids: list[str] = []
        for message in messages:
            is_junk, reasons = classify(message)
            row = {
                "at": now,
                "account": ACCOUNT,
                "messageId": message.get("id"),
                "threadId": message.get("threadId"),
                "date": message.get("date"),
                "from": message.get("from"),
                "subject": message.get("subject"),
                "labels": message.get("labels", []),
                "decision": "marketing_junk" if is_junk else "left_in_inbox",
                "reasons": reasons,
            }
            decisions.append(row)
            if is_junk and message.get("id"):
                junk_ids.append(message["id"])

        changed = 0 if args.dry_run else apply_marketing_junk(junk_ids)
        append_jsonl(DETAIL_LOG, decisions)
        summary = {
            "at": now,
            "account": ACCOUNT,
            "dryRun": args.dry_run,
            "scanned": len(messages),
            "labelledMarketingJunk": 0 if args.dry_run else changed,
            "wouldLabelMarketingJunk": len(junk_ids),
            "leftInInbox": len(messages) - len(junk_ids),
            "ok": True,
        }
        append_jsonl(RUN_LOG, [summary])
        print(json.dumps(summary, ensure_ascii=False))
        return 0
    except Exception as exc:
        row = {
            "at": now,
            "account": ACCOUNT,
            "dryRun": args.dry_run,
            "ok": False,
            "error": str(exc),
        }
        append_jsonl(RUN_LOG, [row])
        print(json.dumps(row, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
