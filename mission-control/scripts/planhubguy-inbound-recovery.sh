#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 '<gmail query 1>' ['<gmail query 2>' ...]" >&2
  echo "Example:" >&2
  echo "  $0 'from:john@knightbuildingsystems.com newer_than:30d' \
    'in:spam from:brian@holloway.co newer_than:30d'" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$SCRIPT_DIR/planhubguy-runner.py"

QUERIES=""
for q in "$@"; do
  if [[ -n "$QUERIES" ]]; then
    QUERIES+=$'\n'
  fi
  QUERIES+="$q"
done

export PLANHUBGUY_MANUAL=1
export PLANHUBGUY_INBOUND_ONLY=1
export PLANHUBGUY_TARGETED_QUERIES="$QUERIES"

exec python3 "$RUNNER"
