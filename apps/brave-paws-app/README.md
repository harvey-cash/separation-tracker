<div align="center">
<img width="1200" alt="Brave Paws Screenshot" src="https://github.com/user-attachments/assets/46d2282e-51a9-4a75-9703-b1b364411cfb" />
</div>

# Brave Paws App

Brave Paws is a local-first React + TypeScript app for planning, running, and reviewing gradual-desensitisation sessions for canine separation anxiety.

Session data is still stored locally in the browser for day-to-day use. Brave Paws hydrates from a connected server on startup when one is available and automatically pushes session changes back in the background.

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
| `VITE_BRAVE_PAWS_PUBLIC_BASE_URL` | No | Canonical landing URL, usually the public or self-hosted `/separation/` route. |
| `VITE_BRAVE_PAWS_APP_URL` | No | Canonical app URL for pairing links and stream QR links. |
| `VITE_BRAVE_PAWS_API_BASE_URL` | No | API base URL, typically `/separation/api/`. |
| `VITE_BRAVE_PAWS_DEFAULT_CAMERA_URL` | No | Optional suggested same-origin camera stream URL shown by the quick-start button. |
| `VITE_BRAVE_PAWS_BACKEND_ROOT_URL` | No | Optional deployment-time backend root override. The app derives `/separation/api/` and the suggested camera link from this root when it is set. |

## Related Docs

- Training-method background: [INFO.md](INFO.md)
- Repo overview and workspace commands: [../../README.md](../../README.md)
- Private-network deployment: [../../docs/quantum-local-tailnet.md](../../docs/quantum-local-tailnet.md)

## Runtime backend override

Brave Paws also supports a browser-local backend override flow for separately hosted frontends.

- Users can enter a backend root such as `https://quantum.tail080401.ts.net:7447` in the in-app connection settings.
- The app then derives the API base and suggested camera link from that root and stores the normalized value in browser storage.
- Hosted/public frontends still need the target backend to allow their origin over CORS for the health test and subsequent API calls to succeed.

## Session Status Tracking

- Active-session controls can mark a single step as **Completed** or **Aborted**.
- Session wrap-up can save the overall session as **Completed** or **Aborted** independently of the step outcomes.
- Session details keep both step outcomes and the session outcome visible and editable, and CSV export/import preserves those statuses.
