# Brave Paws Server

Brave Paws Server is the local-first backend for Brave Paws v0.2.

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
| `npm run create-pairing -- --camera-url https://camera.example/live.stream` | Mint a one-time pairing URL when the pairing broker is enabled. |
| `npm test` | Run the server test suite. |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `BRAVE_PAWS_HOST` | `127.0.0.1` | Bind host for the local server |
| `BRAVE_PAWS_PORT` | `4310` | Bind port for the local server |
| `BRAVE_PAWS_PUBLIC_BASE_URL` | unset | Canonical external base URL used for logs, pairing URLs, and deployment docs |
| `BRAVE_PAWS_CORS_ALLOWED_ORIGINS` | unset | Comma-separated origin allowlist for cross-origin browser access to the API (for example `https://harvey.cash,https://www.harvey.cash`) |
| `BRAVE_PAWS_DATA_DIR` | `var/brave-paws` in the repo | Session storage directory (live QUANTUM deploy uses `/mnt/q/fermi/brave-paws/data`) |
| `BRAVE_PAWS_RECORDINGS_DIR` | `<data dir>/recordings` | Optional canonical recordings directory when session media should live separately from the JSON/CSV session store |
| `BRAVE_PAWS_AUTH_TOKEN` | unset | Token expected in `x-brave-paws-token` for write requests; required before the HTTP pairing-creation endpoint will mint links |
| `BRAVE_PAWS_ENABLE_PAIRING` | `false` | Enables the opaque one-time pairing broker |
| `BRAVE_PAWS_PAIRING_STORE_FILE` | `<data dir>/pairings.json` | Optional override for pairing-token storage |
| `BRAVE_PAWS_CAMERA_UPSTREAM_BASE_URL` | `http://127.0.0.1:18888/` | Upstream picam / MediaMTX root that gets proxied under `/separation/camera/` |
| `BRAVE_PAWS_CAMERA_CONTROL_PROVIDER` | `none` | Optional backend capability provider for camera streaming control (`none` or `command`) |
| `BRAVE_PAWS_CAMERA_CONTROL_LABEL` | `Camera streaming` | Friendly label returned by the capabilities API |
| `BRAVE_PAWS_CAMERA_STATUS_COMMAND` | unset | Shell command that prints `on` / `off`, `true` / `false`, `1` / `0`, or JSON like `{"enabled":true}` |
| `BRAVE_PAWS_CAMERA_ENABLE_COMMAND` | unset | Shell command that enables camera streaming when the command provider is active |
| `BRAVE_PAWS_CAMERA_DISABLE_COMMAND` | unset | Shell command that disables camera streaming when the command provider is active |
| `BRAVE_PAWS_RECORDING_PROVIDER` | `none` | Optional backend capability provider for session recording (`none` or `command`) |
| `BRAVE_PAWS_RECORDING_LABEL` | `Session recording` | Friendly label returned by the recording capability API |
| `BRAVE_PAWS_RECORDING_STATUS_COMMAND` | unset | Shell command that reports recording state as JSON or a simple `idle` / `recording` string |
| `BRAVE_PAWS_RECORDING_START_COMMAND` | unset | Shell command that starts recording for the session id passed through Brave Paws env vars |
| `BRAVE_PAWS_RECORDING_STOP_COMMAND` | unset | Shell command that stops/finalizes/discards recording for the session id passed through Brave Paws env vars |
| `BRAVE_PAWS_RECORDING_VIDEO_HEIGHT` | `540` | Recording output height in pixels; width is derived to preserve aspect ratio |
| `BRAVE_PAWS_RECORDING_VIDEO_BITRATE` | `800k` | Target H.264 video bitrate used by the picam recording helper |
| `BRAVE_PAWS_RECORDING_VIDEO_MAXRATE` | `1000k` | H.264 VBV maxrate used by the picam recording helper |
| `BRAVE_PAWS_RECORDING_VIDEO_BUFSIZE` | `1600k` | H.264 VBV buffer size used by the picam recording helper |
| `BRAVE_PAWS_RECORDING_AUDIO_BITRATE` | `96k` | AAC audio bitrate used by the picam recording helper |

## Storage

Session data is stored as pretty JSON in `sessions.json` and mirrored to `brave_paws_sessions.csv` in the same directory so it stays easy to inspect, back up, and seed from a manual CSV drop.

When session recording is enabled, finalized media files are expected under `BRAVE_PAWS_RECORDINGS_DIR` when it is set, or `<data dir>/recordings/` otherwise. Saved session objects can carry a lightweight `recording` pointer with metadata plus a backend download path.

When pairing is enabled, opaque one-time camera pairing records are stored separately in `pairings.json`. Those links are meant to bootstrap a browser once; after the app resolves a token, it caches the resulting camera link locally and the token cannot be reused.

## Pairing safety notes

- `POST /separation/api/pairings` stays disabled until `BRAVE_PAWS_AUTH_TOKEN` is configured, so enabling pairing does not silently create a public write endpoint.
- Absolute `pairingUrl` values are only returned when `BRAVE_PAWS_PUBLIC_BASE_URL` is configured. Otherwise the server can still mint tokens, but callers must construct the final browser URL themselves.
- Camera URLs with embedded credentials are rejected so secrets do not land in `pairings.json` or pairing responses.

## API summary

Core endpoints:

- `GET /separation/api/health`
- `GET /separation/api/sessions`
- `GET /separation/api/sessions/:id`
- `POST /separation/api/sessions`
- `PUT /separation/api/sessions/:id`
- `POST /separation/api/sync/pull`
- `POST /separation/api/sync/push`
- `POST /separation/api/client-diagnostics`

## Camera streaming capability API

Brave Paws exposes a backend capability contract for camera streaming control:

- `GET /separation/api/capabilities` → returns the capability map
- `GET /separation/api/capabilities/camera-streaming` → returns the current camera streaming state
- `POST /separation/api/capabilities/camera-streaming` with `{ "enabled": true | false }` → requests a state change

The built-in `command` provider is intentionally generic: the server only knows how to run configured shell commands and interpret the returned enabled/disabled state. That keeps the API backend-agnostic so a future provider can control something other than picam without changing the app contract.

On QUANTUM, that generic contract is wired to Harvey's existing picam privacy-toggle skill through `deploy/scripts/brave-paws-picam-camera-control.sh`, which adapts the skill's `privacy_mode=...` output into the simple enabled/disabled signal expected by the API. In the live staging deployment, `brave-paws.service` runs from the clean staging worktree, so the installed unit points at `/mnt/q/repos/separation-tracker-staging/deploy/scripts/...` rather than the source checkout.

## Session recording API

Brave Paws also exposes a session recording contract that is intentionally separate from both the HLS preview path and the Icecast audio path:

- `GET /separation/api/capabilities/recording` → returns recording capability and current state
- `POST /separation/api/recording/start` with `{ "sessionId": "...", "sessionDate": "...", "sessionStatus": "..." }` → starts or resumes recording for a session
- `POST /separation/api/recording/stop` with `{ "sessionId": "...", "disposition": "save" | "discard", "sessionSnapshot": { ... }, "timelineEvents": [ ... ] }` → finalizes or discards the session recording and, on save, captures canonical Brave Paws metadata from the actual runtime timeline
- `GET /separation/api/recordings/file/<relative-path>` → streams a finalized recording file or adjacent sidecar from the canonical recordings directory

When a recording is saved successfully, Brave Paws now writes a canonical v1 JSON sidecar next to the MP4 using the same basename, for example:

- `2026/05/10/session-123.mp4`
- `2026/05/10/session-123.brave-paws.json`

The JSON sidecar is the source of truth. It stores the finalized session snapshot, normalized runtime timeline events, and the derived chapter list. The backend then tries to embed those chapters into the MP4 as a VLC-friendly convenience layer. Chapter embedding is best-effort only: the recording file is kept even if FFmpeg chapter injection fails.

The intended deployment model is a passive extra reader near the media source: the live RTSP publisher remains the same, the in-app HLS preview remains the same, and the Icecast audio stream remains the same. Recording should read the source RTSP feed separately and avoid inserting transcoding or buffering into the live user-facing paths.

On QUANTUM, the sample wiring for this contract lives in `deploy/scripts/brave-paws-picam-recording-control.sh`. It SSHes to `picam`, starts a passive localhost RTSP reader there, transcodes recordings to a storage-friendly H.264 MP4 profile (default: 540p at 800 kbps video plus AAC audio), finalizes the capture, and places the canonical file under the Brave Paws recordings directory on QUANTUM after stop.

## QUANTUM staging notes

- Canonical source repo: `/mnt/q/repos/separation-tracker`
- Dedicated clean staging worktree: `/mnt/q/repos/separation-tracker-staging`
- Live service: `brave-paws.service`
- Auto-refresh oneshot: `brave-paws-staging-refresh.service`
- Auto-refresh timer: `brave-paws-staging-refresh.timer`
- The staging refresh follows the local dev repo's latest **committed** `HEAD`; dirty uncommitted edits are intentionally skipped.
- A healthy `brave-paws-staging-refresh.service` run normally ends as `inactive (dead)` with `status=0/SUCCESS` because it is a oneshot verification/deploy job.
