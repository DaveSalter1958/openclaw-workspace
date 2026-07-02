# Mission Control

Mission Control is Dave's local-first dashboard for daily tasks, PlanHubGuy, calendar review, MyLife notes, and memory browsing.

## Current Sections

- **Tasks** - Mission Control tasks plus actionable email tasks.
- **PlanHubGuy** - outreach status, reply queues, templates, and campaign controls.
- **Calendar** - a clean Google Calendar view.
- **MyLife** - year-indexed life-history notes from `memory/mylife/`.
- **Memory** - local memory browsing and review.

## Data Sources

- Mission Control seed data: `data/mission-control.json`
- Dave task data: `../second-brain/data/tasks.json`
- PlanHubGuy data/state: `data/planhubguy/` and `../memory/planhubguy-state.json`
- Memory notes: `../memory/`

## Run Locally

```bash
npm install
npm run dev
```

Default development port: `3001`.

## Build

```bash
npm run build
```

The production service currently starts Mission Control on port `3010`.
