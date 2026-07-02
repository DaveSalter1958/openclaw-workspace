# Second Brain MVP

A local-first Next.js review system for memories, documents, and tasks.

## What it does now

- **Dashboard** with high-level counts and review prompts
- **Memories** page wired to real workspace memory files:
  - `../MEMORY.md`
  - `../memory/*.md`
- **Documents** page wired to:
  - key workspace notes (`AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md`, etc.)
  - live Dropbox index from `Dropbox:Private - Personal` via `rclone`
- **Tasks** section with local file-backed create + toggle actions
- **No database required** for the MVP

## Product shape

This version is deliberately practical rather than grandiose:

- Uses the **Next.js App Router** with TypeScript
- Stores tasks in plain JSON under `data/`
- Treats the app as a **review surface** first
- Reads memories and documents from the sources Dave actually uses

## Project structure

```text
second-brain/
├── app/
│   ├── api/tasks/route.ts
│   ├── components/
│   ├── documents/page.tsx
│   ├── memories/page.tsx
│   ├── tasks/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── data/
│   └── tasks.json
├── lib/
│   ├── data.ts
│   └── types.ts
├── package.json
└── tsconfig.json
```

## Run locally

```bash
cd second-brain
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Build check

```bash
npm run build
```

## Data sources

### Memories
- Workspace `MEMORY.md`
- Workspace `memory/*.md`

### Documents
- Workspace operating notes
- Dropbox remote `Dropbox:Private - Personal` using `rclone`

### Tasks
- `data/tasks.json`

## Sensible next steps

1. Add task projects, priorities, and due-date editing
2. Add full-text search across memories and documents
3. Add document drill-down and file previews
4. Add weekly review workflow cards
5. Add direct ingestion from additional Dropbox subfolders

## Notes

- This MVP is single-user and local-first.
- Dropbox access depends on a working `rclone` remote named `Dropbox`.
- The app is now useful enough to review real context instead of admiring sample filler.
