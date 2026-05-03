<div align="center">
<img width="1200" alt="Brave Paws Screenshot" src="https://github.com/user-attachments/assets/46d2282e-51a9-4a75-9703-b1b364411cfb" />
</div>

# Brave Paws App

Brave Paws is a local-first React + TypeScript app for planning, running, and reviewing gradual-desensitisation sessions for canine separation anxiety.

Session data is still stored locally in the browser for day-to-day use. v0.2 adds provider-based sync so Harvey can use the QUANTUM backend as the default inspectable storage path while keeping Google Drive as a legacy option.

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

## Environment Variables

Copy `.env.example` to `.env.local` and set values as needed.

| Variable | Required | Description |
|---|---|---|
| `VITE_BRAVE_PAWS_PUBLIC_BASE_URL` | No | Canonical landing URL, usually the Tailnet `/separation/` route. |
| `VITE_BRAVE_PAWS_APP_URL` | No | Canonical app URL for deep links and stream QR links. |
| `VITE_BRAVE_PAWS_API_BASE_URL` | No | API base URL, typically `/separation/api/`. |
| `VITE_BRAVE_PAWS_DEFAULT_CAMERA_URL` | No | Default same-origin picam stream URL shown by the QUANTUM shortcut. |
| `VITE_GOOGLE_CLIENT_ID` | No | OAuth client ID for the legacy Google Drive provider. |

## Related Docs

- Training-method background: [INFO.md](INFO.md)
- Repo overview and workspace commands: [../../README.md](../../README.md)
- Local Tailnet deployment: [../../docs/quantum-local-tailnet.md](../../docs/quantum-local-tailnet.md)

## Session Status Tracking

- Active-session controls can mark a single step as **Completed** or **Aborted**.
- Session wrap-up can save the overall session as **Completed** or **Aborted** independently of the step outcomes.
- Session details keep both step outcomes and the session outcome visible and editable, and CSV export/import preserves those statuses.
