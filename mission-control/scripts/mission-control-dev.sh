#!/usr/bin/env bash
set -euo pipefail

cd /home/davesalter/.openclaw/workspace/mission-control
export NODE_ENV=development
export PORT=3002
exec /usr/bin/npm run dev -- --hostname 0.0.0.0 --port 3002
