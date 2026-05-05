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
- self-hosted API at `/separation/api/`
- same-origin picam proxy at `/separation/camera/`
- optional one-time pairing links at `/separation/app/?pairingToken=…`
- public-safe defaults with environment-specific hosts supplied at deploy time
- pairing creation only over explicit auth, with absolute links emitted only from configured public base URLs

## Workspace commands

From the repo root:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Brave Paws app dev server. |
| `npm run build` | Build landing, app, and server workspaces. |
| `npm test` | Run app and server unit tests. |
| `npm run lint` | Type-check app and server workspaces. |
| `npm run test:e2e` | Run app Playwright tests. |
| `npm run server:start` | Start the compiled Brave Paws server locally. |
| `npm run server:create-pairing -- --camera-url https://camera.example/live.stream` | Mint a one-time pairing URL when the pairing broker is enabled. |

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

- Browser-local persistence remains first-class, with automatic backend hydration/push around it.
- Canonical synced data can live on the self-hosted server while public bundles stay free of private camera origins.
- Pairing records reject credential-bearing camera URLs so secrets do not leak into stored broker state or client responses.
- Public CD remains `main`-only; feature branches get CI without triggering deploy.
