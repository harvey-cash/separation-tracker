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

Session data is stored locally in the browser by default, with optional Google Drive backup if you connect your account.

> For a deeper introduction to the training method, see [INFO.md](INFO.md).
> For instructions on streaming a Windows laptop webcam into Brave Paws, see [windows-camera-helper/README.md](windows-camera-helper/README.md).
> For release and distribution notes, see [RELEASE.md](RELEASE.md).

---

## Features

| Feature | Description |
|---|---|
| Session planner | Add, remove, and reorder timed steps before each training session. New sessions pre-fill with the previous session's step list. |
| Live session runner | Per-step countdown timer with play/pause and manual "mark complete" controls. A background stopwatch tracks total elapsed time. |
| Post-session rating | Three-level anxiety score (Calm / Coping / Panicking) plus a free-text notes field saved with every session. |
| Dashboard | Overview of recent sessions showing date, steps completed, max step duration, and anxiety rating. |
| Training guide | Built-in information view that explains the gradual-desensitisation method and the key principles behind safe separation-anxiety training. |
| Progress chart | Line chart of maximum independence time per session across the full history, powered by Recharts. |
| Session history | Chronological list of all sessions with inline edit and delete. Historical sessions can be added manually. |
| CSV export / import | Export all sessions to a CSV file or import a previously exported file to restore or migrate data. |
| Google Drive backup | Optionally connect Google Drive to back up sessions, sync manually, and resolve cloud-versus-local conflicts. |
| Live camera monitoring | Optionally link a webcam stream during setup or an active session so you can keep an eye on your dog while training. |

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
| Persistence | Browser `localStorage` with optional Google Drive backup |

---

## Project Structure

```
separation-tracker/
├── index.html                    # HTML entry point
├── INFO.md                       # Background on the training method
├── README.md                     # Project overview and setup
├── package.json                  # Scripts and dependencies
├── playwright.config.ts          # Playwright end-to-end test config
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite + Tailwind config
├── e2e/                          # Playwright end-to-end tests
│   ├── dashboard.spec.ts
│   ├── navigation.spec.ts
│   └── session-flow.spec.ts
├── tests/                        # Unit tests for core behavior
│   ├── csv.test.ts
│   ├── dashboard-info-button.test.js
│   └── google-drive.test.ts
├── windows-camera-helper/        # Windows webcam streaming helper
│   ├── README.md
│   ├── go2rtc.yaml
│   ├── setup-and-run.ps1
│   └── start-camera.bat
└── src/
    ├── main.tsx                  # React entry point
    ├── App.tsx                   # Root component and view-state router
    ├── types.ts                  # Shared TypeScript types: Session, Step
    ├── store.ts                  # Session persistence in localStorage
    ├── index.css                 # Global styles
    ├── components/
    │   ├── ActiveSession.tsx
    │   ├── Dashboard.tsx
    │   ├── DurationInput.tsx
    │   ├── GoogleDriveSync.tsx   # Google Drive backup controls
    │   ├── GraphView.tsx
    │   ├── HistoryList.tsx
    │   ├── InfoView.tsx          # In-app training-method explainer
    │   ├── SessionComplete.tsx
    │   ├── SessionConfig.tsx
    │   ├── SessionEditModal.tsx
    │   ├── SessionRunner.tsx
    │   ├── SessionSetup.tsx
    │   └── SessionView.tsx
    ├── hooks/
    │   └── useGoogleDrive.ts     # Google Drive auth and sync logic
    └── utils/
        ├── export.ts             # CSV export and import helpers
        ├── format.ts             # formatDuration and formatTime helpers
        └── googleDrive.ts        # Google Drive API helpers
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

## Optional Windows Camera Streaming

If you want to watch your dog during a training session, Brave Paws can store a camera URL and show that stream during session setup and active training.

For Windows laptops, use the helper in [windows-camera-helper/README.md](windows-camera-helper/README.md). It automates a `go2rtc` plus Cloudflare Tunnel setup, helps you select your webcam and microphone, and gives you a temporary HTTPS URL to paste into the app.

Prerequisites for the helper:

- Windows 10 or 11
- `ffmpeg.exe` available on the machine or placed inside `windows-camera-helper/`

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server on `http://localhost:3000` |
| `npm run build` | Compile a production bundle into `dist/` |
| `npm run preview` | Serve the production build locally for final checks |
| `npm test` | Run the unit tests in `tests/` |
| `npm run test:e2e` | Run the Playwright browser tests in `e2e/` |
| `npm run lint` | Install dependencies if needed, then run the TypeScript compiler in `--noEmit` mode |
| `npm run clean` | Delete the `dist/` directory |

---

## Testing

Run the unit test suite with:

```bash
npm test
```

Run the end-to-end browser tests with:

```bash
npm run test:e2e
```

For a lightweight correctness check without launching browsers, use:

```bash
npm run lint
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values before running locally.

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | No | The URL where the app is hosted. Used for self-referential links. |
| `VITE_GOOGLE_CLIENT_ID` | No | OAuth 2.0 Client ID for Google Drive backup. Override this only if you are hosting your own Google Cloud project. |

If you leave `VITE_GOOGLE_CLIENT_ID` unset, the app falls back to the default client ID included by the project. Google Drive backup remains optional; the app still works locally without connecting Drive.

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
