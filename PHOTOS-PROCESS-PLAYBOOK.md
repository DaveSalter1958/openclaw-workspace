# Mission Control Photos Process Playbook

## Purpose

The Mission Control Photos process helps Dave review project photos from Dropbox, assign useful work-type labels, mark marketing-worthy images, queue unwanted photos for deletion, and rename project photos into a consistent DRS format.

The current workflow is designed to keep Dave's review work fast while handling slow Dropbox writes later in the background.

## Core Principle

Dropbox is the source system.

Mission Control should let Dave review and queue decisions quickly. Actual Dropbox deletes and renames should be performed carefully, backed up first, and applied slowly enough to avoid Dropbox write-rate limits.

## Main Locations

- Photos UI: `/mission-control/photos`
- Delete review UI: `/mission-control/photos/delete-review`
- Main UI component: `mission-control/app/components/PhotoReviewConsole.tsx`
- Photos API: `mission-control/app/api/photos/route.ts`
- Thumbnail API: `mission-control/app/api/photos/thumb/route.ts`
- Delete API: `mission-control/app/api/photos/delete/route.ts`
- Rename API: `mission-control/app/api/photos/rename/route.ts`
- Background queued-ops API: `mission-control/app/api/photos/apply-pending/route.ts`
- Background apply script: `mission-control/scripts/photos-apply-pending.py`
- Refresh script: `mission-control/scripts/photos-refresh.py`

## Important State Files

- Photo catalog: `.tmp/drseng-photo-catalog.json`
- Review state: `.tmp/drseng-photo-review-state.json`
- Thumbnail cache: `.tmp/photo-thumb-cache/`
- Rendered thumbnail cache: `.tmp/photo-thumb-cache-rendered/`
- Queued batch status: `.tmp/photo-pending-ops-status.json`
- Queued batch lock: `.tmp/photo-pending-ops.lock`
- Photo backups: `backups/photos/`

## What the Photo Catalog Contains

The catalog is a local index of Dropbox project photo paths. It includes items such as:

- project number
- current work type, if known
- Dropbox photo path

Mission Control reads this catalog so the browser does not need to directly scan Dropbox each time.

## Normal Review Workflow

### 1. Open Photos

Open Mission Control Photos:

```text
/mission-control/photos
```

The page renders photos in chunks of 200 so the browser stays responsive even when the catalog contains thousands of images.

Use:

- `Load next 200`
- `Show fewer`

as needed.

### 2. Filter the photo set

Use filters to narrow the review set:

- project number
- work type
- marketing-tagged only
- delete candidates only

For best speed, work project-by-project or with a filtered set rather than the full catalog.

### 3. Select photos quickly

Each photo card has a checkbox.

Selection helpers:

- `Select loaded photos`
- `Deselect all selected`
- Ctrl-click range selection
- Shift-click range selection
- Cmd/Meta-click range selection on Mac-style keyboards

Range selection behavior:

1. Select one photo.
2. Hold Ctrl, Shift, or Cmd/Meta.
3. Select another non-adjacent photo.
4. All photos between those two are selected.

### 4. Queue one of the main actions

The edit panel is organized around fast selected-photo actions:

1. **Queue selected for delete**
2. **Mark selected for marketing**
3. **Change work type & queue rename**

These actions save Dave's decisions locally first. They do not need to wait on Dropbox immediately.

## Work Type and Rename Behavior

When Dave chooses a work type and clicks:

```text
Change work type & queue rename
```

Mission Control:

1. saves the selected work type in local review state
2. marks the photo with `pendingRename`
3. shows the photo as queued for rename
4. waits until Dave later runs the queued Dropbox batch

The final Dropbox rename format is:

```text
ProjectNumber Work Type 001.jpg
```

Example:

```text
2009-07 Perm Soldier Pile Wall 001.jpg
```

Notes:

- `.JPG` and `.JPEG` are normalized to `.jpg`.
- Common plural labels are cleaned up, e.g. `Walls` becomes `Wall`.
- Numbering restarts within each existing folder/subfolder.
- Files stay in their current Dropbox folders unless Dave explicitly approves a move.

## Delete Behavior

When Dave clicks:

```text
Queue selected for delete
```

or the per-card:

```text
Queue Delete
```

Mission Control marks the photo as a delete candidate locally. The actual Dropbox delete happens later when queued Dropbox changes are run.

This avoids waiting on Dropbox for each delete while Dave is reviewing photos.

## Marketing Behavior

When Dave clicks:

```text
Mark selected for marketing
```

Mission Control stores the marketing flag locally. This does not rename or delete the file.

Marketing flags are used to identify useful images for future marketing or portfolio work.

## End-of-Session Dropbox Batch

After Dave has reviewed one or more projects and queued renames/deletes, click:

```text
Run queued Dropbox changes
```

This starts a detached background batch through:

```text
/api/photos/apply-pending
```

The batch script:

1. backs up the photo catalog and review state
2. deletes queued delete candidates
3. renames queued `pendingRename` photos
4. updates the local catalog/state after each successful Dropbox write
5. clears thumbnail cache for changed files
6. respects Dropbox cooldown/retry behavior

Use:

```text
Refresh batch status
```

to check progress.

## Dropbox Rate Limits

Dropbox may return `too_many_requests` if too many write operations happen too quickly.

The queued batch is intentionally serialized and slow. This is deliberate.

It is better to let the background process wait through Dropbox cooldowns than to hammer Dropbox and risk a half-updated workflow.

## Backups

Before applying queued Dropbox writes, the background process backs up key files under:

```text
backups/photos/
```

Backups normally include:

- `.tmp/drseng-photo-catalog.json`
- `.tmp/drseng-photo-review-state.json`

For manual sensitive operations, make a backup first.

Example:

```bash
cd /home/davesalter/.openclaw/workspace
stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/photos
cp .tmp/drseng-photo-catalog.json "backups/photos/drseng-photo-catalog-before-manual-change-$stamp.json"
cp .tmp/drseng-photo-review-state.json "backups/photos/drseng-photo-review-state-before-manual-change-$stamp.json"
```

## Safety Rules

- Treat Dropbox as the source system.
- Read/browse/preview before making destructive changes.
- Do not delete Dropbox files unless Dave has explicitly queued or approved the delete.
- Do not move or reorganize Dropbox folders unless Dave explicitly asks.
- Keep files in their existing folders during rename operations.
- Back up local catalog/state before applying queued Dropbox writes.
- If Dropbox rate-limits, wait and retry slowly.
- If a batch partially completes, use the local catalog/state and backup files to inspect before retrying.

## Common Operations

### Refresh the photo catalog

```bash
cd /home/davesalter/.openclaw/workspace/mission-control
python3 scripts/photos-refresh.py
```

### Apply queued Dropbox photo changes manually

```bash
cd /home/davesalter/.openclaw/workspace/mission-control
python3 scripts/photos-apply-pending.py
```

### Check queued batch status

```bash
cat /home/davesalter/.openclaw/workspace/.tmp/photo-pending-ops-status.json
```

### Build and restart Mission Control

```bash
cd /home/davesalter/.openclaw/workspace/mission-control
npm run build
systemctl --user restart mission-control.service
```

## Health Checklist

Use this after changes or if the Photos page behaves oddly:

1. `/mission-control/photos` loads.
2. `/mission-control/api/photos` returns HTTP 200.
3. The Photos page renders in chunks, not all photos at once.
4. Selection, Ctrl/Shift range selection, and deselect work.
5. Work type changes save locally.
6. Rename queue badges appear when expected.
7. Delete queue badges appear when expected.
8. `Run queued Dropbox changes` starts the background process.
9. `Refresh batch status` shows progress.
10. Catalog/state backups exist under `backups/photos/` before Dropbox writes.
11. Final catalog paths match actual Dropbox paths after batch completion.

## Plain-English Summary

Dave reviews and labels photos quickly in Mission Control. His decisions are saved locally first. At the end of the session, Mission Control runs the slow Dropbox renames and deletes in the background, with backups and rate-limit handling, so Dave does not have to wait on Dropbox while reviewing photos.
