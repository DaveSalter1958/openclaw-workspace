#!/usr/bin/env python3
"""Create conservative Notion tasks from actionable Gmail messages.

Reads Dave's business and personal Gmail accounts via gog, then creates tasks in
Notion's Task Tracker database. Designed to be cautious: it skips obvious
newsletters/promotions/alerts and records processed Gmail message IDs locally to
avoid duplicates.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo
from email.utils import parseaddr
from pathlib import Path
from typing import Any
from urllib import request, error

NOTION_DATABASE_ID = "d994df82-7105-4164-882c-0642d2b946bf"
NOTION_TOKEN_PATH = Path.home() / ".config/openclaw/notion-token"
STATE_PATH = Path("/home/davesalter/.openclaw/workspace/state/email-to-notion-tasks.json")
FEEDBACK_PATH = Path("/home/davesalter/.openclaw/workspace/state/email-task-feedback.jsonl")
MISSION_TASKS_PATH = Path("/home/davesalter/.openclaw/workspace/second-brain/data/tasks.json")
LOCAL_TZ = ZoneInfo("America/Los_Angeles")

ACCOUNTS = [
    {
        "name": "DRS",
        "email": "drs@drs-engineering.net",
        "client": "default",
        "query": "newer_than:7d in:inbox -category:promotions -from:notify@mail.notion.so",
    },
    {
        "name": "Personal",
        "email": "drs7890@gmail.com",
        "client": "personal",
        "query": "newer_than:7d in:inbox -category:promotions -from:notify@mail.notion.so",
    },
]

BULK_SENDER_PATTERNS = [
    "no-reply", "noreply", "newsletter", "substack", "mailchimp", "convertkit",
    "zillow", "experian", "nest.com", "sofi", "nextdoor", "performancegolf",
    "notion.so", "emailksa.com", "alerts", "notification", "notify@",
    "venmo", "linkedin", "crewai", "crew ai", "crewagain", "chase.com",
    "reply.asu.edu", "southwest", "exceluniversity", "acehardware",
    "jetterix", "zillow", "experian", "performancegolf", "administerforimplement",
    "nytimes.com", "breathe.calm.com", "proxyvote.com", "mastermind.com",
    "aiadvantage", "blackstone real estate income trust", "phonefusion",
    "xfinity", "acadium", "journi", "intercom-mail.com", "hubspot",
    "constantcontact", "sendgrid", "mailgun", "campaign", "marketing@",
    "sales@", "offers@", "events@", "webinars@", "psohub",
    "budget@", "e.budget.com", "resnexus.com", "garmin", "homedepot.com",
    "order.homedepot.com", "vrbo", "democrats.org", "tommylatrainer",
]

BULK_SUBJECT_PATTERNS = [
    "webinar", "newsletter", "home report", "fico", "credit file", "just listed",
    "sweet mortgage", "top post", "settlement", "class action", "invited you to view",
    "paid you", "password reset", "order has been shipped", "earn 80,000",
    "sparkline", "still on the fence", "manage your mortgage", "countdown is on",
    "more visibility across your market", "you may be a fit",
    "breaking news:", "when did you last put yourself first",
    "final notice", "is live in", "photo album link", "shareholder action requested",
    "your bill from", "bill is now available", "thanks for your payment",
    "we received your order", "congratulations on completing", "[sb4wd]",
    "out of office", "automatic reply", "auto reply", "unsubscribe", "manage preferences",
    "book a demo", "free webinar", "register now", "sign up", "sign-up", "free trial",
    "limited time", "special offer", "learn more", "download our", "white paper",
    "case study", "join us", "save your seat", "last chance", "exclusive offer",
    "invoices that are due", "overdue for your projects",
    "annual plan renews soon", "reservation reminder", "cancel reservation confirmation",
    "confirmation:", "delivery confirmation", "security alert", "thanks for your order",
    "summer’s calling", "summer's calling",
    "wfbn meets", "newly open categories", "share with professionals you trust",
]

MARKETING_BODY_PATTERNS = [
    r"\bunsubscribe\b",
    r"\bmanage (?:your )?(?:email )?preferences\b",
    r"\bview (?:this )?email in (?:your )?browser\b",
    r"\bbook (?:a|your) demo\b",
    r"\bregister now\b",
    r"\bsign up (?:today|now|for|to)\b",
    r"\bfree (?:trial|webinar|guide|download)\b",
    r"\blimited[- ]time\b",
    r"\bexclusive offer\b",
    r"\blearn more\b",
    r"\bdownload (?:our|the)\b",
    r"\bsave your seat\b",
    r"\bmarketing\b",
]

ACTION_PATTERNS = [
    r"\b(?:can|could|would) you\b",
    r"\bplease\s+(?:send|review|confirm|approve|provide|complete|sign|respond|reply|call|schedule|let me know)\b",
    r"\b(?:need|needs|needed)\s+(?:your|you to|approval|signature|response|review|confirmation|decision)\b",
    r"\b(?:review|approve|confirm|respond|reply|send|provide|complete|sign)\s+(?:the|this|attached|your|by|before)\b",
    r"\blet me know\b",
    r"\bcall me\b",
    r"\bfeel free to call\b",
    r"\btime works\b",
    r"\baction required\b",
    r"\b(?:deadline|due)\s+(?:for|by)\s+(?:your|you|dave)\b",
    r"\bare you available\b",
    r"\bdoes .* work for you\b",
]

HIGH_PATTERNS = [r"\burgent\b", r"\basap\b", r"\bdeadline\b", r"\bdue today\b", r"\baction required\b"]
LOW_PATTERNS = [r"\bfyi\b", r"\binvited\b", r"\bwebinar\b", r"\bnewsletter\b"]

SELF_SENDERS = {"drs@drs-engineering.net", "dave@drs-engineering.net", "drs7890@gmail.com"}
DRS_PERSONAL_TASK_SENDERS = {
    "robbiekaye@gmail.com",
}
NON_ACTIONABLE_SUBJECT_PATTERNS = [
    r"\breservation (?:reminder|confirmation)\b",
    r"\bcancel reservation confirmation\b",
    r"\bdelivery confirmation\b",
    r"\bsecurity alert\b",
    r"\bannual plan renews soon\b",
    r"\bthanks for your order\b",
    r"\bbill tracker update\b",
    r"\bpayment (?:received|confirmation)\b",
]


def run(cmd: list[str]) -> str:
    env = os.environ.copy()
    env.setdefault("GOG_KEYRING_PASSWORD", "")
    completed = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, env=env)
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed ({completed.returncode}): {' '.join(cmd)}\n{completed.stderr.strip()}")
    return completed.stdout


def load_state() -> dict[str, Any]:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"processed": {}, "created": []}


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def notion_token() -> str:
    return NOTION_TOKEN_PATH.read_text().strip()


def notion_api(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"https://api.notion.com/v1{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {notion_token()}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Notion API error {exc.code}: {body}") from exc


def query_for_account(account: dict[str, str], after_date: str | None = None) -> str:
    if not after_date:
        return account["query"]
    gmail_date = after_date.replace("-", "/")
    return f"after:{gmail_date} in:inbox -category:promotions -from:notify@mail.notion.so"


def fetch_messages(account: dict[str, str], max_messages: int, after_date: str | None = None) -> list[dict[str, Any]]:
    cmd = ["gog"]
    if account["client"] != "default":
        cmd += ["--client", account["client"]]
    cmd += [
        "gmail", "messages", "search", query_for_account(account, after_date),
        "--account", account["email"],
        "--max", str(max_messages),
        "--include-body",
        "--json",
    ]
    data = json.loads(run(cmd))
    return data.get("messages", [])


def normalized_sender(message: dict[str, Any]) -> tuple[str, str]:
    name, email = parseaddr(message.get("from") or "")
    return name or email or message.get("from", ""), email.lower()


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"https?://\S+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def clean_email_body(value: str) -> str:
    text = html.unescape(value or "")
    text = re.sub(r"(?i)<\s*br\s*/?\s*>", "\n", text)
    text = re.sub(r"(?i)</\s*(?:p|div|li|tr|h[1-6])\s*>", "\n", text)
    text = re.sub(r"(?i)<\s*li\b[^>]*>", "- ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def latest_unquoted_text(value: str) -> str:
    text = value or ""
    quote_markers = [
        r"\n\s*On .{0,220}? wrote:\s*\n",
        r"\n\s*From:\s+.+\n",
        r"\n\s*-{2,}\s*Original Message\s*-{2,}\s*\n",
    ]
    indexes = [match.start() for pattern in quote_markers if (match := re.search(pattern, text, re.I | re.S))]
    if indexes:
        text = text[: min(indexes)]
    return clean_text("\n".join(line for line in text.splitlines() if not line.strip().startswith(">")))


def feedback_subjects() -> set[str]:
    if not FEEDBACK_PATH.exists():
        return set()
    subjects: set[str] = set()
    for line in FEEDBACK_PATH.read_text().splitlines()[-500:]:
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if record.get("action") in {"ignore-task", "trash-email"}:
            subject = str(record.get("subject") or "").strip().lower()
            if subject:
                subjects.add(subject)
    return subjects


def normalized_subject(value: str) -> str:
    value = str(value or "").strip().lower()
    value = re.sub(r"^(?:re|fw|fwd):\s*", "", value)
    value = re.sub(r"\s+", " ", value)
    return value


def looks_like_marketing_text(text: str) -> bool:
    return any(re.search(pattern, text, re.I) for pattern in MARKETING_BODY_PATTERNS)


def is_bulk(message: dict[str, Any]) -> bool:
    sender_raw = (message.get("from") or "").lower()
    subject = (message.get("subject") or "").lower()
    labels = {str(label).upper() for label in message.get("labels", [])}
    if "CATEGORY_PROMOTIONS" in labels:
        return True
    if any(pattern in sender_raw for pattern in BULK_SENDER_PATTERNS):
        return True
    if any(pattern in subject for pattern in BULK_SUBJECT_PATTERNS):
        return True
    body = latest_unquoted_text(message.get("body") or message.get("snippet") or "").lower()
    if looks_like_marketing_text(f"{subject}\n{body}"):
        return True
    return False


def is_actionable(message: dict[str, Any]) -> bool:
    _, sender_email = normalized_sender(message)
    if sender_email in SELF_SENDERS:
        return False
    if is_bulk(message):
        return False
    subject = message.get("subject") or "(no subject)"
    body = latest_unquoted_text(message.get("body") or message.get("snippet") or "")
    text = f"{subject}\n{body}".lower()
    if normalized_subject(subject) in {normalized_subject(item) for item in feedback_subjects()}:
        return False
    if any(re.search(pattern, subject, re.I) for pattern in NON_ACTIONABLE_SUBJECT_PATTERNS):
        return False
    if looks_like_marketing_text(text):
        return False
    if any(re.search(pattern, text) for pattern in ACTION_PATTERNS):
        return True
    # A direct human email with a real question is worth a quick review, but only if it is not a bulk/update category.
    labels = {str(label).upper() for label in message.get("labels", [])}
    return "?" in text and "CATEGORY_UPDATES" not in labels and not looks_like_marketing_text(text)


def priority_for(message: dict[str, Any]) -> str:
    text = f"{message.get('subject') or ''}\n{message.get('body') or ''}".lower()
    if any(re.search(pattern, text) for pattern in HIGH_PATTERNS):
        return "🔴 High"
    if any(re.search(pattern, text) for pattern in LOW_PATTERNS):
        return "🟢 Low"
    return "🟡 Medium"


def title_for(message: dict[str, Any]) -> str:
    sender_name, _ = normalized_sender(message)
    subject = message.get("subject") or "(no subject)"
    body = (message.get("body") or "").lower()
    if "time works" in body or "let me know if this time works" in body:
        return f"Reply to {sender_name}: confirm whether meeting time works"
    if "feel free to call" in body or "call me" in body:
        return f"Call {sender_name} re: {subject}"
    if re.search(r"\breview\b", body):
        return f"Review/respond: {subject}"
    return f"Review/reply: {subject}"


def notes_for(account: dict[str, str], message: dict[str, Any]) -> str:
    sender_name, sender_email = normalized_sender(message)
    body = clean_email_body(message.get("body") or message.get("snippet") or "")
    task_area = task_area_for(account, message)
    return "\n".join([
        f"Source account: {account['name']} <{account['email']}>",
        f"Task area: {task_area}",
        f"From: {sender_name} <{sender_email}>",
        f"Date: {message.get('date', '')}",
        f"Subject: {message.get('subject') or '(no subject)'}",
        f"Gmail message ID: {message.get('id', '')}",
        f"Thread ID: {message.get('threadId', '')}",
        "",
        "Email body:",
        body,
    ]).strip()


def task_area_for(account: dict[str, str], message: dict[str, Any]) -> str:
    _, sender_email = normalized_sender(message)
    if account["name"] == "DRS" and sender_email in DRS_PERSONAL_TASK_SENDERS:
        return "Personal"
    return account["name"]


def make_candidate(account: dict[str, str], message: dict[str, Any]) -> dict[str, Any]:
    task_area = task_area_for(account, message)
    return {
        "account": account["name"],
        "task_area": task_area,
        "account_email": account["email"],
        "message_id": message.get("id"),
        "thread_id": message.get("threadId"),
        "from": message.get("from"),
        "date": message.get("date"),
        "subject": message.get("subject") or "(no subject)",
        "task": title_for(message),
        "priority": priority_for(message),
        "notes": notes_for(account, message),
    }



def notion_date_from_email_date(value: str) -> str | None:
    match = re.match(r"(20\d{2}-\d{2}-\d{2})", value or "")
    return match.group(1) if match else None

def mission_priority(priority: str) -> str:
    if "High" in priority:
        return "high"
    if "Low" in priority:
        return "low"
    return "medium"


def today_local() -> str:
    return datetime.now(LOCAL_TZ).date().isoformat()


def message_local_date(message: dict[str, Any]) -> str | None:
    raw = str(message.get("date") or "").strip()
    if not raw:
        return None
    for parser in (
        lambda value: parsedate_to_datetime(value),
        lambda value: datetime.fromisoformat(value),
    ):
        try:
            dt = parser(raw)
        except (TypeError, ValueError):
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=LOCAL_TZ)
        return dt.astimezone(LOCAL_TZ).date().isoformat()
    match = re.match(r"(20\d{2}-\d{2}-\d{2})", raw)
    return match.group(1) if match else None


def read_mission_tasks() -> list[dict[str, Any]]:
    if MISSION_TASKS_PATH.exists():
        return json.loads(MISSION_TASKS_PATH.read_text())
    return []


def write_mission_tasks(tasks: list[dict[str, Any]]) -> None:
    MISSION_TASKS_PATH.parent.mkdir(parents=True, exist_ok=True)
    MISSION_TASKS_PATH.write_text(json.dumps(tasks, indent=2) + "\n")


def create_mission_task(candidate: dict[str, Any]) -> str:
    tasks = read_mission_tasks()
    task_id = f"email-{candidate['account_email']}-{candidate['message_id']}".lower().replace("@", "-").replace(".", "-")
    if any(task.get("id") == task_id for task in tasks):
        return task_id
    task = {
        "id": task_id,
        "title": candidate["subject"],
        "status": "open",
        "priority": mission_priority(candidate["priority"]),
        "domain": "email",
        "dueDate": today_local(),
        "dueTime": "17:00",
        "project": "Email — DRS" if candidate.get("task_area") == "DRS" else "Email — Personal",
        "notes": candidate["notes"],
        "scope": "business" if candidate.get("task_area") == "DRS" else "personal",
    }
    tasks.insert(0, task)
    write_mission_tasks(tasks)
    return task_id


def create_notion_task(candidate: dict[str, Any]) -> str:
    payload = {
        "parent": {"database_id": NOTION_DATABASE_ID},
        "properties": {
            "Task": {"title": [{"text": {"content": candidate["task"][:2000]}}]},
            "Status": {"status": {"name": "To Do"}},
            "Priority": {"select": {"name": candidate["priority"]}},
            "Account": {"select": {"name": "🏢 DRS" if candidate.get("task_area") == "DRS" else "🏠 Personal"}},
            "Source": {"select": {"name": "📧 Email"}},
            "Sender": {"rich_text": [{"text": {"content": str(candidate.get("from") or "")[:2000]}}]},
            "Email Subject": {"rich_text": [{"text": {"content": str(candidate.get("subject") or "")[:2000]}}]},
            "Gmail ID": {"rich_text": [{"text": {"content": str(candidate.get("message_id") or "")[:2000]}}]},
            "Notes": {"rich_text": [{"text": {"content": candidate["notes"][:2000]}}]},
        },
    }
    email_date = notion_date_from_email_date(str(candidate.get("date") or ""))
    if email_date:
        payload["properties"]["Email Date"] = {"date": {"start": email_date}}
    result = notion_api("POST", "/pages", payload)
    return result["id"]


def collect_candidates(max_messages: int, account_filter: str = "all", after_date: str | None = None, reprocess: bool = False) -> list[dict[str, Any]]:
    state = load_state()
    processed = state.get("processed", {})
    candidates: list[dict[str, Any]] = []
    seen_threads: set[str] = set()
    selected_accounts = [account for account in ACCOUNTS if account_filter == "all" or account["name"].lower() == account_filter]
    for account in selected_accounts:
        for message in fetch_messages(account, max_messages, after_date):
            if after_date and message_local_date(message) != after_date:
                continue
            msg_id = message.get("id")
            thread_id = message.get("threadId") or msg_id
            key = f"{account['email']}:{msg_id}"
            thread_key = f"{account['email']}:thread:{thread_id}"
            if not msg_id or thread_key in seen_threads:
                continue
            if not reprocess and (key in processed or thread_key in processed):
                continue
            if is_actionable(message):
                candidates.append(make_candidate(account, message))
                seen_threads.add(thread_key)
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-messages", type=int, default=25)
    parser.add_argument("--limit", type=int, default=5, help="Maximum tasks to create this run")
    parser.add_argument("--execute", action="store_true", help="Actually create tasks")
    parser.add_argument("--target", choices=["notion", "mission", "both"], default="both", help="Where to create tasks")
    parser.add_argument("--account", choices=["all", "drs", "personal"], default="all", help="Email account group to scan")
    parser.add_argument("--after-date", help="Only scan messages after YYYY-MM-DD")
    parser.add_argument("--reprocess", action="store_true", help="Ignore processed-message state for this run")
    args = parser.parse_args()

    candidates = collect_candidates(args.max_messages, args.account, args.after_date, args.reprocess)
    if not candidates:
        print("No actionable email task candidates found.")
        return 0

    print(f"Found {len(candidates)} actionable candidate(s).")
    for i, candidate in enumerate(candidates[: args.limit], 1):
        print(f"{i}. [{candidate['account']}] {candidate['priority']} {candidate['task']}")
        print(f"   From: {candidate['from']} | {candidate['date']}")
        print(f"   Subject: {candidate['subject']}")

    if not args.execute:
        print(f"Dry run only. Re-run with --execute to create tasks in {args.target}.")
        return 0

    state = load_state()
    processed = state.setdefault("processed", {})
    created_log = state.setdefault("created", [])
    created = 0
    for candidate in candidates[: args.limit]:
        key = f"{candidate['account_email']}:{candidate['message_id']}"
        thread_key = f"{candidate['account_email']}:thread:{candidate['thread_id'] or candidate['message_id']}"
        if not args.reprocess and (key in processed or thread_key in processed):
            continue
        result: dict[str, Any] = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "task": candidate["task"],
            "target": args.target,
        }
        if args.target in ("notion", "both"):
            result["notion_page_id"] = create_notion_task(candidate)
        if args.target in ("mission", "both"):
            result["mission_task_id"] = create_mission_task(candidate)
        processed[key] = result
        processed[thread_key] = processed[key]
        created_log.append({"key": key, **result})
        created += 1
    save_state(state)
    print(f"Created {created} task(s) in {args.target}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
