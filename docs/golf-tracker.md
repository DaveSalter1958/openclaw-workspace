# Golf Tracker

This is Dave's local golf round store. It is meant for quick Telegram dictation while playing, then later querying by course, date, tee color, game type, score, hole, shot, club, or notes.

## Files

- Data store: `data/golf/rounds.json`
- Course reference notes: `data/golf/course-reference.json`
- Capture/query script: `scripts/golf-store.mjs`

## Round Setup

When Dave starts a round, capture:

- date
- course
- tee color or tee name
- postable round: yes/no
- scoring format: stroke, match, Stableford, scramble, skins, etc.
- game type or wager, if any
- players, if provided

Example:

```bash
node scripts/golf-store.mjs start-round --date 2026-08-04 --course "Sandpiper" --tee-color blue --postable yes --format stroke --game "skins" --players "Dave,Steve"
```

## Shot Capture

Record dictated shots as structured data when possible, and keep the raw dictated text in `text`.

Example:

```bash
node scripts/golf-store.mjs add-shot --round latest --hole 1 --shot 1 --club driver --from tee --to fairway --distance 235 --result "middle fairway" --text "driver 235 middle fairway"
```

If the dictation is incomplete, use `note` rather than guessing:

```bash
node scripts/golf-store.mjs note --round latest --hole 4 --text "chunked wedge short right, need exact yardage later"
```

## Hole Scoring

Use `hole` to set or update the scorecard for a hole.

```bash
node scripts/golf-store.mjs hole --round latest --hole 1 --score 5 --putts 2 --fairway hit --gir no --penalties 0
```

## Queries

```bash
node scripts/golf-store.mjs list
node scripts/golf-store.mjs show --round latest
node scripts/golf-store.mjs summary --round latest
node scripts/golf-store.mjs query --text "Sandpiper blue driver"
```

## Agent Handling Rules

- Do not invent missing golf facts. Store uncertain dictation as a note.
- Preserve Dave's raw phrasing in `text` or `notes`.
- Prefer `latest` for the active round unless Dave names a date/course.
- If Dave says the round is not postable, store `postable: false`.
- If Dave asks questions later, query `data/golf/rounds.json` and summarize from stored facts only.
