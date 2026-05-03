# Brave Paws Monorepo

Brave Paws is a local-first separation-anxiety training app for Harvey.

The repo now has three primary surfaces:

1. `Brave Paws Landing` in `apps/brave-paws-landing`
2. `Brave Paws App` in `apps/brave-paws-app`
3. `Brave Paws Server` in `apps/brave-paws-server`

## v0.2 direction

Brave Paws Streamer has been retired for v0.2.

The intended architecture is now:

- landing page at `/separation/`
- app at `/separation/app/`
- QUANTUM-hosted API at `/separation/api/`
- same-origin picam proxy at `/separation/camera/`
- Tailnet-first hosting on `quantum.tail080401.ts.net`

## Workspace commands

From the repo root:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Brave Paws app dev server. |
| `npm run build` | Build landing, app, and server workspaces. |
| `npm test` | Run app and server unit tests. |
| `npm run lint` | Type-check app and server workspaces. |
| `npm run test:e2e` | Run app Playwright tests. |
| `npm run server:start` | Start the compiled QUANTUM server locally. |

## Workspace layout

```text
apps/
├── brave-paws-app/
├── brave-paws-landing/
└── brave-paws-server/
```

## Docs

- Local Tailnet deployment: [docs/quantum-local-tailnet.md](docs/quantum-local-tailnet.md)
- App workspace notes: [apps/brave-paws-app/README.md](apps/brave-paws-app/README.md)
- Server workspace notes: [apps/brave-paws-server/README.md](apps/brave-paws-server/README.md)

## Notes

- Browser-local persistence remains first-class.
- QUANTUM sync is the default v0.2 remote provider.
- Google Drive remains available as a legacy provider during migration.
- Public CD remains `main`-only; feature branches get CI without triggering deploy.
