<div align="center">
<img width="1200" alt="Brave Paws Screenshot" src="https://github.com/user-attachments/assets/46d2282e-51a9-4a75-9703-b1b364411cfb" />
</div>

# Brave Paws — Canine Separation Anxiety Tracker

A science-based gradual desensitisation protocol tracker for dogs with separation anxiety. Brave Paws helps owners plan, run, and review training sessions that gradually build a dog's tolerance for being alone, following recognised behaviour-modification techniques.

## What It Does

Canine separation anxiety is an involuntary panic response — not a disobedience problem. The gold-standard treatment is **gradual desensitisation**: planned absences that stay below the dog's anxiety threshold, remove predictable departure cues, and vary in duration so the dog never learns "it only gets worse." Over many sessions the maximum alone-time is gently extended while the dog stays calm.

Brave Paws turns that protocol into a guided workflow:

1. **Plan** – build a list of timed steps for the session (e.g. 30 s, 10 s, 1 min …).
2. **Train** – run each step with a per-step countdown and an overall session stopwatch.
3. **Reflect** – rate how calm the dog was (Calm / Coping / Panicking) and add optional notes.
4. **Review** – browse the full session history, visualise progress over time, and tweak past records.

All session data is stored locally in the browser (`localStorage`), so no account or server is required.

> For a deeper introduction to the training method, see [INFO.md](INFO.md).

---

## Features

| Feature | Description |
|---|---|
| Session planner | Add, remove, and reorder timed steps before each training session. New sessions pre-fill with the previous session's step list. |
| Live session runner | Per-step countdown timer with play/pause and manual "mark complete" controls. A background stopwatch tracks total elapsed time. |
| Post-session rating | Three-level anxiety score (Calm / Coping / Panicking) plus a free-text notes field saved with every session. |
| Dashboard | Overview of recent sessions showing date, steps completed, max step duration, and anxiety rating. |
| Progress chart | Line chart of maximum independence time per session across the full history, powered by Recharts. |
| Session history | Chronological list of all sessions with inline edit and delete. Historical sessions can be added manually. |
| CSV export / import | Export all sessions to a CSV file or import a previously exported file to restore or migrate data. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Build tool | [Vite 6](https://vitejs.dev/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) (via `@tailwindcss/vite`) |
| Charts | [Recharts](https://recharts.org/) |
| Icons | [Lucide React](https://lucide.dev/) |
| Animations | [Motion](https://motion.dev/) |
| Date helpers | [date-fns](https://date-fns.org/) |
| Persistence | Browser `localStorage` |

---

## Project Structure

```
separation-tracker/
├── index.html              # HTML entry point
├── vite.config.ts          # Vite + Tailwind config
├── tsconfig.json           # TypeScript config
├── package.json
├── .env.example            # Environment variable template
├── metadata.json           # App metadata
└── src/
    ├── main.tsx            # React entry point
    ├── App.tsx             # Root component — view routing (dashboard → config → active → complete → history → graph)
    ├── types.ts            # Shared TypeScript types: Session, Step
    ├── store.ts            # useSessions hook — localStorage read/write
    ├── index.css           # Global styles
    ├── components/
    │   ├── Dashboard.tsx        # Home screen with recent sessions
    │   ├── SessionConfig.tsx    # Pre-session step planner
    │   ├── ActiveSession.tsx    # Live countdown timer UI
    │   ├── SessionComplete.tsx  # Post-session rating and notes
    │   ├── SessionView.tsx      # Read-only detail view of a saved session
    │   ├── SessionEditModal.tsx # Modal to edit a saved session
    │   ├── SessionRunner.tsx    # Reusable session-running logic
    │   ├── SessionSetup.tsx     # Reusable session-setup logic
    │   ├── GraphView.tsx        # Progress line chart
    │   ├── HistoryList.tsx      # Full session history with CSV controls
    │   └── DurationInput.tsx    # Minutes + seconds input widget
    └── utils/
        ├── export.ts       # CSV export and import helpers
        └── format.ts       # formatDuration and formatTime helpers
```

---

## Development Setup

**Prerequisites:** [Node.js](https://nodejs.org/) 18 or later.

```bash
# 1. Install dependencies
npm install

# 2. Start the development server (http://localhost:3000)
npm run dev
```

The dev server runs on port 3000 with hot-module replacement (HMR) enabled by default.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server on `http://localhost:3000` |
| `npm run build` | Type-check and compile a production bundle into `dist/` |
| `npm run preview` | Serve the production build locally for final checks |
| `npm run lint` | Run the TypeScript compiler in `--noEmit` mode to catch type errors |
| `npm run clean` | Delete the `dist/` directory |

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values before running locally.

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | No | The URL where the app is hosted. Used for self-referential links. |

---

## Building for Production

```bash
npm run build
```

The compiled output is written to `dist/`. Because the app is entirely client-side, `dist/` can be served from any static file host (Netlify, Vercel, GitHub Pages, Cloud Run, etc.).

To verify the build locally before deploying:

```bash
npm run preview
```

---

## Deployment

For any static host:

1. Run `npm run build`.
2. Deploy the contents of `dist/` to your host.
