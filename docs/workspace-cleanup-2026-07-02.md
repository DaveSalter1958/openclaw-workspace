# Workspace Cleanup Report - 2026-07-02

## Current Status

Initial `git status --short` showed:

- 21 modified tracked files
- 12 deleted tracked files
- 172 untracked files/directories

Largest changed areas:

- `mission-control/`: 87 entries
- `memory/`: 63 entries
- Root-level generated/reference files: videos, PDFs, playbooks, exports, backups, logs, and reports

## Classification

### Source / App Work

Likely intentional source changes, but should be reviewed and committed in coherent groups:

- `mission-control/app/**`
- `mission-control/lib/**`
- `mission-control/scripts/**`
- `mission-control/README.md`
- `mission-control/mission-control.service`
- `mission-control/.gitignore`
- `mission-control/data/task-project-options.json`
- `mission-control/assets/`
- `mission-control/systemd/`

Major themes visible from filenames:

- Mission Control agent rename/removal work: Guy/Willy/ClawHub/Remotion routes and pages removed.
- PlanHubGuy workflow/UI changes.
- Mission Control task and email-action APIs/components.
- PlanHubGuy scripts and recovery/audit tooling.

### Workspace Context And Memory

Should probably be tracked or deliberately moved to a private memory store:

- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `TOOLS.md`
- `MEMORY.md`
- `HEARTBEAT.md`
- `memory/*.md`
- `memory/mylife/*.md`
- `memory/references/*.md`
- `DRS-DROPBOX-PLAYBOOK.md`

Raw runtime memory/state logs need a separate decision:

- `memory/*.log`
- `memory/*.jsonl`
- `memory/email-cleanup/*.jsonl`
- `memory/planhubguy-state.json`
- `state/*.jsonl`

### Generated / Local Artifacts

Likely not source. Ignore or archive after review:

- `.tmp/`
- `.trash/`
- `backups/`
- `exports/`
- `media/`
- `output/`
- `reports/`
- `migration-bundles/`
- `planhubguy-backup/`
- `photo-drive-audit/`
- `*.log`
- `*.bak`

### Deliverables Or Reference Artifacts

Do not ignore/delete automatically; Dave may want these:

- `*.pdf`
- `*.mp4`
- `*.doc`
- generated summaries/playbooks
- `dave-profile-summary.*`
- `Lifes_Trails_extracted.doc`

## Safe Improvement Applied

Added root `.gitignore` for clearly local/runtime folders and generic generated logs/cache.

## Recommended Commit Groups

1. Workspace context compression
   - `AGENTS.md`
   - `SOUL.md`
   - `USER.md`
   - `TOOLS.md`
   - `MEMORY.md`
   - `HEARTBEAT.md`
   - new topic memory files
   - `.gitignore`
   - this cleanup report

2. Mission Control shell/navigation cleanup
   - Deleted Guy/Willy/ClawHub/Remotion routes/pages/components
   - Layout/sidebar/tooling changes

3. Mission Control task/email workflow
   - Agent task UI changes
   - Task editor and task column components
   - Email task API routes/components
   - Related type/data changes

4. PlanHubGuy UI and runtime changes
   - PlanHubGuy panel/templates changes
   - PlanHubGuy route changes
   - PlanHubGuy runner/cron/service changes
   - PlanHubGuy scripts and workflow specs

5. Memory/history import
   - Long-term memory `.md` files
   - My Life files
   - Reference files

6. Archive/export artifacts
   - PDFs, videos, extracted docs, generated summaries
   - Commit only if these are deliberate deliverables; otherwise move outside the repo or leave ignored.

## Next Steps

1. Review the untracked source-looking files under `mission-control/`.
2. Decide which memory logs/state files should be tracked versus ignored.
3. Run tests/build for Mission Control before source commits.
4. Commit groups separately.
5. Only after commit/backup, preview cleanup with `git clean -nd` or `git clean -ndX`.
