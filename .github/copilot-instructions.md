# Brave Paws repository guidance

## Repo surfaces

This repo currently contains three active workspaces:

1. **Brave Paws Landing** in `apps/brave-paws-landing`
2. **Brave Paws App** in `apps/brave-paws-app`
3. **Brave Paws Server** in `apps/brave-paws-server`

Brave Paws Streamer is retired for v0.2 and should not be reintroduced casually.

## Product direction

- Brave Paws is now a Harvey-first, local-first Tailnet app.
- QUANTUM serves the landing page, app, backend API, and same-origin picam proxy.
- Browser-local state remains important for UX.
- QUANTUM sync is the default remote provider.
- Google Drive is legacy / optional.

## Commands

| Command | Description |
| --- | --- |
| `npm run build` | Build landing, app, and server workspaces |
| `npm test` | Run app and server unit tests |
| `npm run lint` | Type-check app and server workspaces |
| `npm run test:e2e` | Run app Playwright tests |
| `npm run server:start` | Start the compiled local QUANTUM server |

## Important paths

- Landing path: `/separation/`
- App path: `/separation/app/`
- API path: `/separation/api/`
- Camera path: `/separation/camera/`

## Expectations

- Remove streamer-era assumptions instead of preserving compatibility by default.
- Prefer config-driven URLs over hard-coded public-host assumptions.
- Keep the repo ready for feature-branch CI without accidental public CD.
- Validate meaningful changes with tests, type-checks, builds, or local endpoint checks.
