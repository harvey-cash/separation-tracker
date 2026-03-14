# Brave Paws Workspace

This repository contains three first-class web and desktop surfaces:

1. `Brave Paws Landing` in `apps/brave-paws-landing`, the public entrypoint for `harvey.cash/separation/`.
2. `Brave Paws App` in `apps/brave-paws-app`, the React web app for planning, running, and reviewing separation-anxiety training sessions.
3. `Brave Paws Streamer` in `apps/brave-paws-streamer`, the Windows camera-streaming companion used to pair a live dog-camera feed with the app.

Production hosting targets:

- `https://harvey.cash/separation/` for the Brave Paws landing page
- `https://harvey.cash/separation/app/` for Brave Paws App
- `https://harvey.cash/separation/streamer/` for the hosted Brave Paws Streamer UI

The repo is organized as an npm workspaces monorepo. Each surface keeps its own source, tests, build config, and package manifest inside its project directory. The root package only orchestrates shared install, CI, release, and convenience commands.

## Layout

```text
separation-tracker/
├── apps/
│   ├── brave-paws-app/
│   │   ├── README.md
│   │   ├── package.json
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── playwright.config.ts
│   │   ├── INFO.md
│   │   ├── .env.example
│   │   ├── src/
│   │   ├── tests/
│   │   └── e2e/
│   ├── brave-paws-landing/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── styles.css
│   │   └── vite.config.js
│   └── brave-paws-streamer/
│       ├── README.md
│       ├── package.json
│       ├── tests/
│       ├── windows-camera-helper/
│       └── windows-camera-helper-ui/
├── .github/workflows/
├── package.json
├── package-lock.json
└── RELEASE.md
```

## Workspace Commands

Run these from the repo root:

| Command | Description |
|---|---|
| `npm install` | Install workspace dependencies for all workspaces. |
| `npm run dev` | Start the Brave Paws App dev server. |
| `npm run landing:dev` | Start the landing page dev server. |
| `npm test` | Run the Brave Paws App unit tests. |
| `npm run lint` | Type-check the Brave Paws App workspace. |
| `npm run build` | Build the landing page and Brave Paws App web artifacts. |
| `npm run test:e2e` | Run the Brave Paws App Playwright suite. |
| `npm run camera-helper:gui` | Start Brave Paws Streamer locally. |
| `npm run camera-helper:health` | Run the Brave Paws Streamer health check. |
| `npm run camera-helper:bundle` | Build `apps/brave-paws-streamer/dist/brave-paws-streamer.zip`. |

## Project Docs

- Web app setup and feature details: [apps/brave-paws-app/README.md](apps/brave-paws-app/README.md)
- Landing page source: [apps/brave-paws-landing/index.html](apps/brave-paws-landing/index.html)
- Web app training-method background: [apps/brave-paws-app/INFO.md](apps/brave-paws-app/INFO.md)
- Streamer overview and development commands: [apps/brave-paws-streamer/README.md](apps/brave-paws-streamer/README.md)
- Streamer end-user notes and runtime details: [apps/brave-paws-streamer/windows-camera-helper/README.md](apps/brave-paws-streamer/windows-camera-helper/README.md)
- Release and distribution guide: [RELEASE.md](RELEASE.md)
