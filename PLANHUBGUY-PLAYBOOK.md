# PlanHubGuy Playbook

## Purpose

PlanHubGuy helps DRS Engineering identify likely PlanHub opportunities, send controlled outreach, monitor replies, and prepare polite context-aware follow-up responses for Dave to review.

The guiding rules are:

1. Prevent duplicate outreach.
2. Keep Dave's review queue clean.
3. Never lose track of what was sent, received, or answered.
4. Send external email only through the approved workflow.
5. Back up state before scheduled work.

## Primary Locations

- Mission Control app: `mission-control/`
- Main runner: `mission-control/scripts/planhubguy-runner.py`
- Reply/review helper: `mission-control/scripts/planhubguy-review.py`
- Scheduled wrapper: `mission-control/scripts/planhubguy-cron.sh`
- Backup script: `mission-control/scripts/planhubguy-backup.py`
- Queue refresh script: `mission-control/scripts/planhubguy-refresh-queues.py`
- Workflow spec: `mission-control/scripts/PLANHUBGUY-WORKFLOW-SPEC.md`
- Mission Control UI: `/mission-control/workflows`

## Accounts and Auth

PlanHubGuy uses `gog` for Google Workspace access.

Key accounts:

- Outreach/reply mailbox: `Dave@DRS-Engineering.net`
- Google Sheets/workbook account: `drs@drs-engineering.net`
- Personal Gmail exists separately: `drs7890@gmail.com`

Check auth with:

```bash
gog auth list
```

Basic Gmail smoke check:

```bash
gog gmail search 'newer_than:7d' --max 1 --account Dave@DRS-Engineering.net
```

Required Gmail labels:

- `Possible Work`
- `Follow up`
- `Automatic Reply`
- `Responded`
- `Bad Email`

## Scheduled Run

PlanHubGuy is scheduled by a user systemd timer:

- Service: `planhubguy-weekday-run.service`
- Timer: `planhubguy-weekday-run.timer`
- Schedule: weekdays at 1:00 PM

Current service command:

```bash
/usr/bin/bash /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-cron.sh
```

The cron wrapper does:

1. Create pre-run backup.
2. Run inbound review only.
3. Run scheduled outreach/follow-up pass.
4. Refresh Mission Control queues.

Check timer:

```bash
systemctl --user list-timers --all | grep planhubguy
```

Check recent run log:

```bash
tail -120 /home/davesalter/.openclaw/workspace/memory/planhubguy-weekday-run.log
```

## Backups

Pre-run backups are created under:

```text
backups/planhubguy/planhubguy-state-*.tgz
```

They include:

- PlanHubGuy state
- PlanHubGuy logs
- templates
- reply edit learning file
- core scripts
- main review UI file

Manual backup:

```bash
cd /home/davesalter/.openclaw/workspace/mission-control
python3 scripts/planhubguy-backup.py
```

Retention: latest 30 archives.

## Core Logs and State

Important local files:

- State: `memory/planhubguy-state.json`
- Structured runner log: `memory/planhubguy-log.jsonl`
- Scheduled run output: `memory/planhubguy-weekday-run.log`
- Reply-send log: `mission-control/scripts/tmp/planhubguy-reply-send.log`
- Reply learning log: `mission-control/data/planhubguy/reply-edit-learning.jsonl`

Quick validation:

```bash
python3 -m json.tool /home/davesalter/.openclaw/workspace/memory/planhubguy-state.json >/dev/null
python3 - <<'PY'
from pathlib import Path
import json
for p in [
  Path('/home/davesalter/.openclaw/workspace/memory/planhubguy-log.jsonl'),
  Path('/home/davesalter/.openclaw/workspace/mission-control/scripts/tmp/planhubguy-reply-send.log'),
  Path('/home/davesalter/.openclaw/workspace/mission-control/data/planhubguy/reply-edit-learning.jsonl'),
]:
    if not p.exists():
        print(p, 'missing')
        continue
    bad=[]
    lines=p.read_text(errors='replace').splitlines()
    for n,line in list(enumerate(lines,1))[-50:]:
        try: json.loads(line)
        except Exception as e: bad.append((n,str(e)))
    print(p, 'lines', len(lines), 'tail_bad', bad[:3])
PY
```

## Normal Workflow

### 1. Candidate Review

PlanHubGuy reads the PlanHub Google Sheet, normalizes contacts/projects, scores likely DRS relevance, and applies duplicate suppression.

Likelihood categories:

- High
- Medium
- Low

Low-likelihood projects remain eligible if Dave's settings include them; they are not permanently excluded.

### 2. Duplicate Suppression

Hard rule:

> No contact should receive more than one initial template email for the same project.

Suppression checks must not rely on Outreach Log alone. Evidence sources include:

- Outreach Log
- Response Log
- Gmail sent-mail history from `Dave@DRS-Engineering.net`
- known invalid/bad-email records
- suppression/exclusion state

If duplicate evidence exists, do not send.

### 3. Initial Outreach

Initial outreach uses the approved template and sender identity:

```text
Dave@DRS-Engineering.net
```

Each send must result in:

- Gmail sent-message evidence
- Outreach Log row
- message id/thread id where available
- local structured log entry

If Gmail accepts the send but a post-send lookup fails, do not crash the run. Log the lookup failure and preserve the raw Gmail ids.

### 4. Inbound Reply Classification

Incoming mail in `Dave@DRS-Engineering.net` is classified into Gmail labels/states.

Use:

- `Follow up` for real human-written replies needing or possibly needing action.
- `Automatic Reply` for out-of-office, auto acknowledgements, and non-human replies.
- `Bad Email` for bounces, undeliverable, invalid recipient, blocked/rejected mail.
- `Responded` after Dave/PlanHubGuy sends a reply.
- `Closed - Not Interested` for clear human declines/no-interest.

Automatic replies should not clutter Dave's manual follow-up queue.

### 5. Mission Control Review Queue

Mission Control shows the working reply queues:

- `Possible Work`
- `Follow up`
- `Automatic Reply` hidden by default

Dave reviews suggested replies in `/mission-control/workflows`.

Buttons/actions should behave optimistically where Gmail is slow:

- Mark possible work
- Mark follow up
- Mark automatic
- Mark responded / close
- Send reply

After a reply is sent:

- remove/supersede `Follow up`
- apply `Responded`
- remove the item from the Mission Control queue
- write reply-send log entry
- capture Dave's edits when final sent body differs from the suggestion

## Suggested Reply Rules

Replies should be short, polite, and context-specific.

Do:

- answer the context naturally
- include the SOQ sentence when the SOQ will be attached
- place SOQ sentence before `Thanks` / signature
- use the provided signature image only after body text
- learn from Dave's edits

Do not:

- quote/summarize the recipient's email back with phrases like “your email said” or “your note said”
- repeat the project name in the body when it is already in the subject
- force generic sales language
- send unsafe replies without Dave approval

Wrong-contact/not-involved replies should say, in effect:

> Thank you for the update, and apologies for bothering you. It looks like our information must be incorrect.

Procurement/portal guidance replies should usually be short: thank them for the procurement guidance without adding an extra DRS pitch unless Dave asks.

## Statement of Qualifications and Signature

SOQ path:

```text
mission-control/data/planhubguy/DRS_Statement_of_Qualifications.pdf
```

Signature/logo assets:

```text
mission-control/data/planhubguy/DRS_Email_Logo.png
mission-control/data/planhubguy/DRS_Email_Signature.jpg
```

When SOQ is attached, include:

```text
Please find attached our Statement of Qualification for your information. Please feel free to share it with customers or clients as you see fit.
```

## Safety Rules

- Do not touch junk/marketing filters in `Dave@DRS-Engineering.net`; that mailbox is for PlanHubGuy.
- External email sends require the approved PlanHubGuy workflow.
- Never bypass duplicate suppression.
- Never mark email as sent unless Gmail accepted it and logs/state were updated or an explicit repair flag exists.
- Ambiguous human replies should become `Follow up`, not be discarded.
- `Do Not Contact` overrides everything.
- Keep Telegram progress updates minimal: task started, occasional high-level working update, task complete.

## Common Operations

### Refresh reply queues

```bash
cd /home/davesalter/.openclaw/workspace/mission-control
python3 scripts/planhubguy-refresh-queues.py
```

### Generate current candidate report without sending

```bash
cd /home/davesalter/.openclaw/workspace/mission-control
PLANHUBGUY_REPORT_ONLY=1 python3 scripts/planhubguy-runner.py
```

### Inbound-only check

```bash
cd /home/davesalter/.openclaw/workspace/mission-control
PLANHUBGUY_INBOUND_ONLY=1 python3 scripts/planhubguy-runner.py
```

### Build and restart Mission Control

```bash
cd /home/davesalter/.openclaw/workspace/mission-control
npm run build
systemctl --user restart mission-control.service
```

### Check Mission Control service

```bash
systemctl --user status mission-control.service --no-pager
```

## Health Checklist

Use this after changes or if Dave reports odd behavior:

1. `gog auth list` shows required accounts.
2. Gmail search works for `Dave@DRS-Engineering.net`.
3. Required Gmail labels exist.
4. `memory/planhubguy-state.json` parses as JSON.
5. Recent JSONL logs parse cleanly.
6. `python3 -m py_compile` passes on key scripts.
7. `npm run build` passes.
8. `mission-control.service` is active.
9. `planhubguy-weekday-run.timer` is enabled/waiting.
10. `/mission-control/workflows` loads.
11. No duplicate system-level Mission Control service owns port 3010.

## Trust Ladder

Current automation posture:

1. Improve drafts first.
2. Learn from Dave's edits.
3. Only later consider auto-send for very safe, low-risk categories.

Likely future auto-send candidates, only after Dave explicitly approves:

- wrong-contact apology
- procurement guidance thank-you
- keep-contact-info-on-file + SOQ

Until then, human review remains the default for replies.
