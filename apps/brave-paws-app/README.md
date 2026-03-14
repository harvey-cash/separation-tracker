<div align="center">
<img width="1200" alt="Brave Paws Screenshot" src="https://github.com/user-attachments/assets/46d2282e-51a9-4a75-9703-b1b364411cfb" />
</div>

# Brave Paws App

Brave Paws is a client-side React + TypeScript app for planning, running, and reviewing gradual-desensitisation sessions for canine separation anxiety.

Session data is stored locally in the browser by default, with optional Google Drive backup if you connect your account.

Production deployments target `https://harvey.cash/separation/app/`.

## Key Commands

From this directory:

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server on `http://localhost:3000`. |
| `npm test` | Run the unit tests in `tests/`. |
| `npm run lint` | Run `tsc --noEmit`. |
| `npm run build` | Build the production app into `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run test:e2e` | Run the Playwright end-to-end suite in `e2e/`. |

From the repo root, the equivalent delegated commands are `npm run dev`, `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e`.

## Structure

```text
apps/brave-paws-app/
├── package.json
├── index.html
├── vite.config.ts
├── tsconfig.json
├── playwright.config.ts
├── INFO.md
├── .env.example
├── src/
├── tests/
└── e2e/
```

## Environment Variables

Copy `.env.example` to `.env.local` and set values as needed.

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | No | Hosting URL used for self-referential links. For production this should be `https://harvey.cash/separation/app/`. |
| `VITE_GOOGLE_CLIENT_ID` | No | OAuth client ID for Google Drive backup. |

If `VITE_GOOGLE_CLIENT_ID` is unset, the app falls back to the built-in default client ID.

## Related Docs

- Training-method background: [INFO.md](INFO.md)
- Repo overview and workspace commands: [../../README.md](../../README.md)
- Release process: [../../RELEASE.md](../../RELEASE.md)