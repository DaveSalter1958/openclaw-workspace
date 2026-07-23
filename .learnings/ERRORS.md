# Errors

Command failures and integration errors.

---
## [ERR-20260718-001] shell_heredoc_redirection

**Logged**: 2026-07-18T09:04:38-07:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
A Node heredoc command failed because output redirection was placed after the heredoc terminator inside the script text.

### Error
```text
Expression expected
```

### Context
- Command attempted during cron health report collection.
- The redirection should be attached to the heredoc-opening command, not written after the `NODE` terminator.

### Suggested Fix
For shell heredocs, use `node - <<'NODE' > /tmp/file` before the script body when redirecting stdout.

### Metadata
- Reproducible: yes
- Related Files: none
- See Also: none

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

## [ERR-20260704-001] credential_audit_redaction

**Logged**: 2026-07-04T08:00:00-07:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Credential audit metadata inspection must redact fields named `access` and `refresh`, not only names containing `token`, `secret`, `key`, or `credential`.

### Error
```text
An auth-profile metadata inspection command redacted key/token-named fields but allowed OAuth fields named access and refresh into command output.
```

### Context
- Task: daily API key health and spend audit.
- The report artifacts should remain fully redacted; the mistake was in diagnostic command output during inspection.
- Future audit commands should default to allowlisting safe metadata fields rather than denylisting secret-looking names.

### Suggested Fix
Use an allowlist for provider/type/email/account/plan metadata, and redact any field not explicitly allowed when inspecting auth stores.

### Metadata
- Reproducible: yes
- Related Files: /home/davesalter/.openclaw/agents/main/agent/openclaw-agent.sqlite
- See Also: none

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
## [ERR-20260715-001] jq_missing_in_cron_health_report

**Logged**: 2026-07-15T09:05:00-07:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
`jq` was not installed in the workspace shell when validating the cron health JSON report.

### Error
```text
/bin/bash: line 1: jq: command not found
```

### Context
- Command attempted: `jq . state/cron-health/latest.json >/dev/null`
- Task: validate generated cron health monitor snapshot JSON.
- Fallback validation with Node.js `JSON.parse` succeeded.

### Suggested Fix
Use Node.js for JSON validation in this workspace, or install `jq` if command-line JSON inspection should be standard.

### Metadata
- Reproducible: yes
- Related Files: /home/davesalter/.openclaw/workspace/state/cron-health/latest.json
- See Also: none

---
## [ERR-20260722-001] skill_workshop_apply_approval_route_unavailable

**Logged**: 2026-07-22T21:00:00-07:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
`skill_workshop` could create and inspect a pending skill proposal from Telegram, but could not apply it after Dave explicitly approved.

### Error
```text
Plugin approval unavailable (no approval route)
```

### Context
- Operation attempted: `skill_workshop action=apply`.
- Proposal: `job-site-inspection-reporter-20260723-a33d9a0206`.
- Dave explicitly requested: `apply job-site-inspection-reporter-20260723-a33d9a0206`.
- Follow-up inspect confirmed the proposal remained `pending`.

### Suggested Fix
Provide an approval route for `skill_workshop apply` in Telegram/OpenClaw direct sessions, or expose a clear user-facing alternate command/UI path for applying pending proposals.

### Metadata
- Reproducible: unknown
- Related Files: none
- See Also: none

---
