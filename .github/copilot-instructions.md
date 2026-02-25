# Copilot Instructions — Brave Paws Separation Anxiety Tracker

## Project Overview

**Brave Paws** is a client-side React + TypeScript single-page application that guides dog owners through a gradual-desensitisation training programme for canine separation anxiety. The app lets users plan timed training sessions, run live countdowns, rate each session, and review progress over time via a history list and chart.

All data is persisted in **browser `localStorage`** — there is no back-end database or server-side API.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 + TypeScript 5 |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin — **no `tailwind.config.js`**) |
| Charts | Recharts |
| Icons | Lucide React |
| Animations | Motion |
| Date helpers | date-fns |
| AI (optional) | Google Gemini API via `@google/genai` |
| Persistence | Browser `localStorage` (key: `csa_tracker_sessions`) |

---

## Repository Layout

```
separation-tracker/
├── index.html              # Vite HTML entry point
├── vite.config.ts          # Vite config: React + Tailwind plugins, GEMINI_API_KEY inlining, HMR toggle
├── tsconfig.json           # TypeScript config
├── package.json            # Scripts: dev / build / preview / lint / clean
├── .env.example            # Environment variable template
├── metadata.json           # Google AI Studio app metadata
└── src/
    ├── main.tsx            # ReactDOM.createRoot entry
    ├── App.tsx             # Root component — view-state router (see View type)
    ├── types.ts            # Shared types: Session, Step
    ├── store.ts            # useSessions hook — CRUD over localStorage
    ├── index.css           # Global CSS (Tailwind base import)
    ├── components/
    │   ├── Dashboard.tsx        # Home: recent sessions, nav to history/graph
    │   ├── SessionConfig.tsx    # Pre-session step planner (add/remove/reorder steps)
    │   ├── ActiveSession.tsx    # Live per-step countdown + overall stopwatch
    │   ├── SessionComplete.tsx  # Post-session anxiety rating + notes
    │   ├── SessionView.tsx      # Read-only detail view of a saved session
    │   ├── SessionEditModal.tsx # Modal to edit a saved session inline
    │   ├── SessionRunner.tsx    # Reusable session-running logic (used by ActiveSession)
    │   ├── SessionSetup.tsx     # Reusable step-setup logic (used by SessionConfig)
    │   ├── GraphView.tsx        # Line chart: max independence time per session
    │   ├── HistoryList.tsx      # Full history with edit, delete, CSV export/import
    │   └── DurationInput.tsx    # Minutes + seconds input widget
    └── utils/
        ├── export.ts       # exportToCSV / parseCSV helpers
        └── format.ts       # formatDuration / formatTime helpers
```

---

## Core Data Types (`src/types.ts`)

```ts
type Step = {
  id: string;           // crypto.randomUUID()
  durationSeconds: number;
  completed: boolean;
};

type Session = {
  id: string;           // crypto.randomUUID()
  date: string;         // ISO 8601 string
  steps: Step[];
  totalDurationSeconds: number;
  anxietyScore?: 0 | 1 | 2;   // 0 = Calm, 1 = Coping, 2 = Panicking
  notes?: string;
  completed: boolean;
};
```

---

## View Routing

`App.tsx` uses a single `currentView` state string (type `View`) to switch between screens — **there is no React Router**:

| `currentView` value | Component rendered |
|---|---|
| `'dashboard'` | `<Dashboard>` |
| `'config'` | `<SessionConfig>` |
| `'active'` | `<ActiveSession>` |
| `'complete'` | `<SessionComplete>` |
| `'graph'` | `<GraphView>` |
| `'history'` | `<HistoryList>` (inline in App) |
| `'session-view'` | `<SessionView>` |

Navigation is done by calling `setCurrentView(...)`. A `previousView` state is used to support the back button from `session-view`.

---

## State Management (`src/store.ts`)

The `useSessions()` hook is the single source of truth:
- Reads from `localStorage` on mount.
- Writes to `localStorage` on every change via `useEffect`.
- Exposes: `sessions`, `addSession`, `updateSession`, `deleteSession`.

Only `App.tsx` calls `useSessions()`; all child components receive data and callbacks as props.

---

## Development Workflow

### Prerequisites

Node.js 18 or later.

### Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local and set GEMINI_API_KEY="<your-key>"
npm run dev          # http://localhost:3000 with HMR
```

Set `DISABLE_HMR=true` in the environment to disable hot-module replacement (used by AI Studio to prevent flickering during agent edits).

### Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Type-check + production bundle → `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | `tsc --noEmit` — catches type errors (the only lint step) |
| `npm run clean` | Remove `dist/` |

### Linting / Type Checking

```bash
npm run lint    # tsc --noEmit
```

There is **no ESLint or Prettier** configured. Type correctness is the only automated check.

### Testing

There are **no automated tests** in this repository. Validate changes by running `npm run lint` and manually exercising the dev server.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | For AI features | Google Gemini API key. Inlined into the client bundle by Vite via `process.env.GEMINI_API_KEY`. In AI Studio it is injected automatically. |
| `APP_URL` | No | Hosting URL for self-referential links. Injected by AI Studio at runtime. |

`GEMINI_API_KEY` is exposed to the browser — **never commit a real key to source control**.

---

## Styling Conventions

- **Tailwind CSS v4** is used exclusively; no custom CSS classes beyond the global `index.css` import.
- There is no `tailwind.config.js` — configuration is done via CSS variables / Tailwind v4 defaults.
- Use Tailwind utility classes directly on JSX elements, consistent with the existing component style.

---

## Common Patterns

### Adding a new view
1. Add the new string literal to the `View` type in `App.tsx`.
2. Add a conditional render block in the `App` return JSX.
3. Create the component in `src/components/`.

### Adding a new session field
1. Extend the `Session` type in `src/types.ts`.
2. Update `store.ts` if any CRUD logic needs changing.
3. Update `SessionComplete.tsx` (capture the value) and `SessionView.tsx` / `HistoryList.tsx` (display the value).
4. Update `src/utils/export.ts` if the field should appear in CSV exports.

### Using the Gemini API
Access the key via `process.env.GEMINI_API_KEY` (inlined at build time by Vite). Import the client from `@google/genai`.

---

## Known Limitations / Gotchas

- **No router** — deep-linking to a specific view is not supported; the app always opens on the dashboard.
- **localStorage only** — data does not persist across browsers or devices.
- **`GEMINI_API_KEY` is a client-side secret** — it is inlined into the JS bundle; treat it as a low-trust key.
- **Tailwind v4** — the `@tailwindcss/vite` plugin is used instead of PostCSS. Do not add a `tailwind.config.js` or `postcss.config.js` unless migrating away from v4.
- **HMR** — disabled when `DISABLE_HMR=true` (AI Studio environment). This is intentional.
