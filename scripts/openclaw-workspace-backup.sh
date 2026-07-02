#!/usr/bin/env bash
set -euo pipefail

repo="/home/davesalter/.openclaw/workspace"
branch="${OPENCLAW_BACKUP_BRANCH:-master}"
remote="${OPENCLAW_BACKUP_REMOTE:-origin}"

cd "$repo"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a Git workspace: $repo" >&2
  exit 1
fi

if ! git remote get-url "$remote" >/dev/null 2>&1; then
  echo "Missing Git remote '$remote'. Add a private GitHub remote before backup can push." >&2
  exit 2
fi

timestamp="$(TZ=America/Los_Angeles date '+%Y-%m-%d %H:%M:%S %Z')"

git add -A

if git diff --cached --quiet; then
  echo "No workspace changes to commit at $timestamp."
else
  git commit -m "OpenClaw workspace backup - $timestamp"
fi

git push "$remote" "$branch"
