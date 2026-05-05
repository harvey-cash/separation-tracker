# Brave Paws Server

Brave Paws Server is the local-first QUANTUM backend for Brave Paws v0.3.

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
| `BRAVE_PAWS_DATA_DIR` | `var/brave-paws` in the repo | Session storage directory (live QUANTUM deploy uses `/mnt/q/fermi/brave-paws/data`) |
| `BRAVE_PAWS_AUTH_TOKEN` | unset | Optional token expected in `x-brave-paws-token` for write requests |
| `BRAVE_PAWS_CAMERA_UPSTREAM_BASE_URL` | `http://127.0.0.1:18888/` | Upstream camera / MediaMTX root that gets proxied under `/separation/camera/` |
| `BRAVE_PAWS_CAMERA_CONTROL_PROVIDER` | `none` | Optional backend capability provider for camera streaming control (`none` or `command`) |
| `BRAVE_PAWS_CAMERA_CONTROL_LABEL` | `Camera streaming` | Friendly label returned by the capabilities API |
| `BRAVE_PAWS_CAMERA_STATUS_COMMAND` | unset | Shell command that prints `on` / `off`, `true` / `false`, `1` / `0`, or JSON like `{"enabled":true}` |
| `BRAVE_PAWS_CAMERA_ENABLE_COMMAND` | unset | Shell command that enables camera streaming when the command provider is active |
| `BRAVE_PAWS_CAMERA_DISABLE_COMMAND` | unset | Shell command that disables camera streaming when the command provider is active |

## Storage

Session data is stored as pretty JSON in `sessions.json` and mirrored to `brave_paws_sessions.csv` in the same directory so it stays easy to inspect, back up, and seed from a manual CSV drop.

## Camera streaming capability API

Brave Paws now exposes a backend capability contract for camera streaming control:

- `GET /separation/api/capabilities` → returns the capability map
- `GET /separation/api/capabilities/camera-streaming` → returns the current camera streaming state
- `POST /separation/api/capabilities/camera-streaming` with `{ "enabled": true | false }` → requests a state change

The built-in `command` provider is intentionally generic: the server only knows how to run configured shell commands and interpret the returned enabled/disabled state. That keeps the API backend-agnostic so a future provider can control something other than picam without changing the app contract.
