# Errors

Command failures and integration errors.

---

## [ERR-20260702-002] openclaw_cron_agentturn_no_shell

**Logged**: 2026-07-02T16:38:39-07:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
PlanHubGuy OpenClaw cron runs reported success while the agent-turn payload failed to run the requested shell command because no shell/exec tool was available.

### Error
```text
Failed: I don't have a shell/terminal execution tool available in this session, so I couldn't run the requested PlanHubGuy command.
```

### Context
- Job: `PlanHubGuy automation` (`1e0c3abe-0e21-4c89-b6dc-bb4926aa29a6`).
- Recent isolated `agentTurn` cron runs used provider `openai` and had no shell tool, but still ended with cron status `ok`.
- A temporary direct `payload.kind="command"` cron test ran successfully on the gateway with exit code 0.
- The live job was converted from LLM `agentTurn` execution to direct gateway command execution via the OpenClaw CLI.

### Suggested Fix
For scheduled scripts, prefer OpenClaw cron `command` payloads over asking an isolated LLM agent turn to call shell tools. Also treat "Failed:" summaries inside `ok` cron runs as operational failures during audits.

### Metadata
- Reproducible: yes
- Related Files: /home/davesalter/.openclaw/workspace/mission-control/scripts/planhubguy-runner.py
- See Also: LRN-20260702-001

---

## [ERR-20260702-001] openclaw_cli_path

**Logged**: 2026-07-02T15:58:31-07:00
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
Heartbeat shell could not run `openclaw doctor --non-interactive` because `openclaw` was not on `PATH`.

### Error
```text
/bin/bash: line 1: openclaw: command not found
```

### Context
- Command attempted after gateway restart health follow-up requested `openclaw doctor --non-interactive`.
- CLI was present at `/home/davesalter/.npm-global/bin/openclaw`.
- Running `/home/davesalter/.npm-global/bin/openclaw doctor --non-interactive` succeeded with exit code 0.

### Suggested Fix
Ensure heartbeat/non-interactive shells include `/home/davesalter/.npm-global/bin` on `PATH`, or use the absolute OpenClaw CLI path in automated health follow-ups.

### Metadata
- Reproducible: yes
- Related Files: /home/davesalter/.openclaw/workspace/HEARTBEAT.md

---
