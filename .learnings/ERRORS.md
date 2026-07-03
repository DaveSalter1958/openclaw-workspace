# Errors

Command failures and integration errors.

---

## [ERR-20260703-001] pkill_f_self_match

**Logged**: 2026-07-03T11:17:00-07:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
Using `pkill -f` to close Chromium matched the invoking shell command line and interrupted the shell.

### Error
```text
Process exited with code -1 while closing Chromium via pkill -f.
```

### Context
- Command/operation attempted: close a stale Chromium dashboard process so a new no-keyring browser launcher would be used.
- The target process was removed, but the shell was interrupted because the `pkill -f` pattern also appeared in the command line.
- No private command output or tokens are logged here.

### Suggested Fix
Prefer selecting process IDs first with `pgrep`/`ps`, then pass exact PIDs to `kill`, or use a pattern that cannot match the invoking shell.

### Metadata
- Reproducible: yes
- Related Files: /home/davesalter/.local/share/applications/chromium-no-keyring.desktop

---

## [ERR-20260702-001] mission-control-dev-base-path

**Logged**: 2026-07-02T16:58:22-07:00
**Priority**: low
**Status**: pending
**Area**: frontend

### Summary
Mission Control dev route verification used `/teams` and got a 404 because the app is mounted under `/mission-control`.

### Error
`GET /teams` returned 404; `GET /mission-control/teams` returned the expected page content.

### Context
- Command/operation attempted: verify the new Teams page via local Next dev server.
- Environment: Mission Control Next app running on port 3001.
- The app emits links and assets under `/mission-control`, so smoke tests should use the mounted path.

### Suggested Fix
Use `http://localhost:3001/mission-control/<route>` for local Mission Control route checks unless the base path is intentionally changed.

### Metadata
- Reproducible: yes
- Related Files: mission-control/app/layout.tsx, mission-control/app/teams/page.tsx

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
