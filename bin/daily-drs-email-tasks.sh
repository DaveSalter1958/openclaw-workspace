#!/usr/bin/env bash
set -euo pipefail
export PATH="/home/davesalter/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-}"
cd /home/davesalter/.openclaw/workspace

log_dir="/home/davesalter/.openclaw/workspace/memory"
log_file="$log_dir/daily-drs-email-tasks.log"
mkdir -p "$log_dir"

{
  printf '[%s] DRS email task scan starting\n' "$(date -Is)"
  /usr/bin/python3 /home/davesalter/.openclaw/workspace/bin/email-to-notion-tasks.py \
    --account drs \
    --target mission \
    --max-messages 50 \
    --limit 10 \
    --execute
  printf '[%s] DRS email task scan complete\n' "$(date -Is)"
} >>"$log_file" 2>&1
