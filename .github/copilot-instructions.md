# Copilot Instructions — Brave Paws Separation Anxiety Tracker

## Project Overview

This repository is an **npm workspaces monorepo** containing two related applications:

1. **Brave Paws App** in `apps/brave-paws-app`, a client-side React + TypeScript SPA for planning timed training sessions, running countdowns, rating outcomes, and reviewing progress.
2. **Brave Paws Streamer** in `apps/brave-paws-streamer`, a Windows camera-streaming companion that publishes a secure live stream and pairing QR code for the app.

All Brave Paws App session data is persisted in **browser `localStorage`** with optional Google Drive Cloud sync — there is no back-end database or server-side API for the web app.

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
| Persistence | Browser `localStorage` (key: `csa_tracker_sessions`) |

---

## Repository Layout

```
separation-tracker/
├── apps/
│   ├── brave-paws-app/
│   │   ├── package.json         # App scripts: dev / build / preview / test / lint / test:e2e
│   │   ├── index.html           # Vite HTML entry point
│   │   ├── vite.config.ts       # Vite config: React + Tailwind plugins, root version injection
│   │   ├── tsconfig.json        # TypeScript config
│   │   ├── playwright.config.ts # Playwright config for e2e
│   │   ├── .env.example         # Environment variable template
│   │   ├── INFO.md              # Training-method background
│   │   ├── src/
│   │   │   ├── main.tsx         # ReactDOM.createRoot entry
│   │   │   ├── App.tsx          # Root component — view-state router (see View type)
│   │   │   ├── types.ts         # Shared types: Session, Step
│   │   │   ├── store.ts         # useSessions hook — CRUD over localStorage
│   │   │   ├── index.css        # Global styles
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── utils/
│   │   ├── tests/               # App unit tests
│   │   └── e2e/                 # App Playwright tests
│   └── brave-paws-streamer/
│       ├── package.json         # Streamer scripts: gui / health / bundle / test
│       ├── tests/               # Streamer unit tests
│       ├── windows-camera-helper/
│       │   ├── README.md
│       │   └── go2rtc.yaml
│       └── windows-camera-helper-ui/
│           ├── public/
│           ├── server.cjs
│           ├── health-check.mjs
│           ├── package-portable.mjs
│           └── streamer-assets.cjs
├── package.json                 # Root workspace scripts and shared version
├── package-lock.json            # Shared lockfile
└── RELEASE.md                   # Release and artifact notes
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
  exercisedLevel?: 0 | 1 | 2 | 3 | 4 | 5;
  anyoneHome?: string;
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

Node.js 18 or later (CI runs on Node.js 22).

### Setup

```bash
npm install
cp apps/brave-paws-app/.env.example apps/brave-paws-app/.env.local
npm run dev          # http://localhost:3000 with HMR
```

Set `DISABLE_HMR=true` in the environment to disable hot-module replacement (used by AI Studio to prevent flickering during agent edits).

### Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Delegate to Brave Paws App dev server on port 3000 |
| `npm run build` | Build Brave Paws App → `apps/brave-paws-app/dist/` |
| `npm run preview` | Preview Brave Paws App build |
| `npm run lint` | `tsc --noEmit` in the Brave Paws App workspace |
| `npm test` | Run Brave Paws App unit tests |
| `npm run test:e2e` | Run Brave Paws App Playwright tests |
| `npm run camera-helper:gui` | Start Brave Paws Streamer locally |
| `npm run camera-helper:health` | Run Brave Paws Streamer health check |
| `npm run camera-helper:bundle` | Build Brave Paws Streamer bundle → `apps/brave-paws-streamer/dist/` |
| `npm run streamer:test` | Run Brave Paws Streamer unit tests |
| `npm run clean` | Remove workspace build outputs |

### Linting / Type Checking

```bash
npm run lint
```

There is **no ESLint or Prettier** configured. Type correctness is the only automated check.

### Testing

Validate web-app changes with `npm test`, `npm run lint`, `npm run build`, and optionally `npm run test:e2e`. Validate streamer changes with `npm run streamer:test`, `npm run camera-helper:health`, and `npm run camera-helper:bundle` on Windows when packaging or runtime behavior is affected.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | No | Hosting URL for self-referential links. Injected by AI Studio at runtime. |
| `VITE_GOOGLE_CLIENT_ID` | No | OAuth 2.0 Client ID for Google Drive sync. Defaults to the bundled Brave Paws client ID when unset. |

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

### Build-time constants
The Vite config injects `__APP_VERSION__` from the root `package.json` and defines `import.meta.env.VITE_GOOGLE_CLIENT_ID` at build time.

---

## Known Limitations / Gotchas

- **No router** — Brave Paws App deep-linking to a specific view is not supported; the app always opens on the dashboard.
- **localStorage only** — data does not persist across browsers or devices.
- **Google Drive sync is client-side OAuth** — keep `VITE_GOOGLE_CLIENT_ID` aligned with the hosted origin if you deploy your own Google Cloud project.
- **Tailwind v4** — the `@tailwindcss/vite` plugin is used instead of PostCSS. Do not add a `tailwind.config.js` or `postcss.config.js` unless migrating away from v4.
- **HMR** — disabled when `DISABLE_HMR=true` (AI Studio environment). This is intentional.
- **Streamer paths are package-local** — keep Brave Paws Streamer path resolution rooted in `apps/brave-paws-streamer`, not the repo root, so packaging and CI remain stable.
