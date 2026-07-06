#!/usr/bin/env bash
set -euo pipefail

export PATH="/home/davesalter/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:${PATH:-}"
export GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-}"

ROOT="/home/davesalter/.openclaw/workspace/mission-control"
LOCK="/tmp/planhubguy-marketing-stats-refresh.lock"

cd "$ROOT"
exec 9>"$LOCK"
if ! /usr/bin/flock -n 9; then
  printf '[%s] Marketing statistics refresh already running; exiting.\n' "$(date -Is)"
  exit 0
fi

printf '[%s] Rebuilding PlanHubGuy campaign ledger through today.\n' "$(date -Is)"
/usr/bin/python3 "$ROOT/scripts/planhubguy-rebuild-campaign-ledger.py" --end "$(date +%F)" --refresh-cache

printf '[%s] Regenerating Mission Control marketing statistics.\n' "$(date -Is)"
/usr/bin/python3 "$ROOT/scripts/planhubguy-marketing-stats-from-ledger.py"

printf '[%s] PlanHubGuy marketing statistics refresh complete.\n' "$(date -Is)"
