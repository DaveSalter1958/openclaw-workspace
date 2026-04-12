# Mission Control

A local-first Next.js MVP for planning and shaping custom tools.

This app is intentionally separate from `second-brain`. It acts as a practical planning layer where Dave can:

- track tool ideas
- define reusable modules
- sketch workflows
- maintain a build queue
- keep the structure tidy before adding persistence and execution

## What is in this MVP

- **Dashboard** — summary of ideas, modules, workflows, and build priorities
- **Tool Ideas** — a registry of candidate tools with problem statements and next steps
- **Modules** — reusable primitives that can be shared across tools
- **Workflows** — multi-step operational flows with triggers and checkpoints
- **Studio** — an honest view of what to build next and where the local data lives

## Local-first data

Seed data currently lives in:

- `data/mission-control.json`

That makes the structure easy to inspect and edit by hand. The obvious next step is local persistence via sqlite or JSON write actions.

## Run locally

From the workspace root:

```bash
cd mission-control
npm install
npm run dev
```

Then open:

- <http://localhost:3001>

Mission Control is configured to use port **3001** by default so Second Brain can stay on port **3000** without conflict.

## Build for verification

```bash
cd mission-control
npm run build
```

## Notes

- This scaffold does **not** modify `second-brain`.
- Styling and structure are intentionally clean and lightweight.
- The app is read-only for now; data entry forms and local persistence should be the next engineering pass.

## Suggested next steps

1. Add form-based capture for new tool ideas and workflow notes.
2. Persist records locally with sqlite.
3. Add source references back to local notes or second-brain content.
4. Track workflow runs and outcomes.
