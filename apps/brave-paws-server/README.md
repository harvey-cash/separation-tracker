# Brave Paws Server

Brave Paws Server is the local-first QUANTUM backend for Brave Paws v0.2.

It serves three things from one localhost process:

1. the landing page at `/separation/`
2. the app at `/separation/app/`
3. the JSON API and picam proxy under `/separation/api/` and `/separation/camera/`

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run the server in watch mode. |
| `npm run build` | Compile the TypeScript server to `dist/`. |
| `npm run start` | Start the compiled server. |
| `npm test` | Run the server test suite. |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `BRAVE_PAWS_HOST` | `127.0.0.1` | Bind host for the local server |
| `BRAVE_PAWS_PORT` | `4310` | Bind port for the local server |
| `BRAVE_PAWS_PUBLIC_BASE_URL` | unset | Canonical external base URL for docs / logs |
| `BRAVE_PAWS_DATA_DIR` | `var/brave-paws` in the repo | Session storage directory |
| `BRAVE_PAWS_AUTH_TOKEN` | unset | Optional token expected in `x-brave-paws-token` for write requests |
| `BRAVE_PAWS_CAMERA_UPSTREAM_BASE_URL` | `http://127.0.0.1:18888/` | Upstream picam / MediaMTX root that gets proxied under `/separation/camera/` |

## Storage

Session data is stored as pretty JSON in `sessions.json` so it stays easy to inspect and back up.
