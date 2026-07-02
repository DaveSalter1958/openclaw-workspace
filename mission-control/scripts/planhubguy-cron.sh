#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/davesalter/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:${PATH:-}"
cd /home/davesalter/.openclaw/workspace/mission-control

log_step() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

log_step "PlanHubGuy scheduled run starting"
log_step "Creating pre-run backup"
/usr/bin/python3 /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-backup.py

log_step "Inbound review"
/usr/bin/env PLANHUBGUY_INBOUND_ONLY=1 /usr/bin/python3 /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py

log_step "Scheduled outreach/follow-up run"
/usr/bin/env PLANHUBGUY_SCHEDULED_SEND=1 /usr/bin/python3 /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py

log_step "Refreshing Mission Control queues"
/usr/bin/python3 /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-refresh-queues.py

log_step "Refreshing Mission Control marketing statistics"
/usr/bin/python3 /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-marketing-stats-from-ledger.py
log_step "PlanHubGuy scheduled run complete"
