# PlanHubGuy changeset map

This file exists to make review easier after the large mixed commit `7acac1f`.

## PlanHubGuy core and repair work

These files are the heart of the PlanHubGuy workstream:

- `scripts/planhubguy-runner.py`
- `scripts/planhubguy_runner_refactor.py`
- `scripts/planhubguy-cron.sh`
- `scripts/planhubguy_inbound_audit_lib.py`
- `scripts/planhubguy-inbound-recovery.sh`
- `scripts/planhubguy-mailbox-valid-reply-audit.py`
- `scripts/planhubguy-response-gap-audit.py`
- `scripts/planhubguy-response-backfill-missing.py`
- `scripts/planhubguy-missing-reply-recovery-candidates.py`
- `scripts/planhubguy-response-cleanup-safe.py`
- `scripts/planhubguy-response-reorganize-safe.py`
- `scripts/planhubguy-response-dedupe.py`
- `scripts/planhubguy-response-normalize.py`
- `scripts/planhubguy-response-repair.py`
- `scripts/planhubguy-outreach-repair.py`
- `scripts/planhubguy-sheet-cleanup.py`
- `scripts/PLANHUBGUY-INBOUND-NOTES.md`
- `scripts/PLANHUBGUY-INBOUND-RECOVERY-README.md`

## Mission Control UI and operations changes related to PlanHubGuy

These support operating PlanHubGuy safely in Mission Control:

- `app/api/planhubguy/route.ts`
- `app/components/PlanHubGuyPanel.tsx`
- `app/components/EnvironmentSwitcher.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `mission-control-dev.service`
- `scripts/mission-control-dev.sh`

## Broader Mission Control changes committed at the same time

These are useful, but not part of the PlanHubGuy core repair path:

- task creation flow
  - `app/api/tasks/route.ts`
  - `app/components/NewTaskForm.tsx`
  - `app/tasks/new/page.tsx`
  - `app/page.tsx`
- agent operations board work
  - `app/components/AgentTaskConsole.tsx`
  - `lib/data.ts`
  - `lib/types.ts`

## Practical review guidance

If someone wants to review only the PlanHubGuy repair/refactor work, start with:

1. `scripts/planhubguy-runner.py`
2. `scripts/planhubguy_inbound_audit_lib.py`
3. `scripts/planhubguy-response-gap-audit.py`
4. `scripts/planhubguy-response-backfill-missing.py`
5. `scripts/planhubguy-response-reorganize-safe.py`
6. `app/components/PlanHubGuyPanel.tsx`
7. `app/api/planhubguy/route.ts`

## Key current conclusions

- Sender + subject is the most reliable bounded recovery key.
- Gmail thread id is useful but not trustworthy enough as the sole join key.
- Recovery/backfill should run with PlanHubGuy disabled and inbound-only.
- `Response Log` should preserve all content but surface valid replies first.
