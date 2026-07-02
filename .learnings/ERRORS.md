# Errors

Command failures and integration errors.

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
