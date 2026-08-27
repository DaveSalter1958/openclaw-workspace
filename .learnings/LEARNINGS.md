# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## [LRN-20260826-001] best_practice

**Logged**: 2026-08-26T20:44:35-07:00
**Priority**: medium
**Status**: pending
**Area**: data

### Summary
Patch task JSON with ID-scoped context when changing repeated fields.

### Details
While marking two Mission Control personal tasks complete, an initial generic patch changed the first two `"status": "open"` fields in `second-brain/data/tasks.json`, which belonged to unrelated email tasks. Verification caught it immediately and the unrelated statuses were restored before completion.

### Suggested Action
For JSON task edits, patch with nearby stable identifiers such as `id` and `title`, then validate by reading back the exact affected records.

### Metadata
- Source: error
- Related Files: second-brain/data/tasks.json
- Tags: json, apply_patch, mission-control

---

## [LRN-20260702-001] best_practice

**Logged**: 2026-07-02T16:38:39-07:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Use OpenClaw cron command payloads for deterministic scheduled shell scripts.

### Details
OpenClaw isolated `agentTurn` cron jobs can lose access to shell/exec tools depending on runtime/tool surface. That makes them a poor fit for scripts that should simply run a known command. The CLI supports `--command`, `--command-argv`, `--command-cwd`, and `--command-env`, which create `payload.kind="command"` jobs executed directly by the gateway.

### Suggested Action
When converting or repairing recurring local automations, use direct cron command payloads where possible. Reserve `agentTurn` cron jobs for work that genuinely needs model reasoning.

### Metadata
- Source: error
- Related Files: /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py
- Tags: openclaw, cron, automation
- See Also: ERR-20260702-002
- Pattern-Key: openclaw.cron.direct_command_for_scripts
- Recurrence-Count: 1
- First-Seen: 2026-07-02
- Last-Seen: 2026-07-02

---
