# Brave Paws v0.2 local Tailnet deployment

This repo now includes a single local-first server workspace for Brave Paws v0.2.

## What runs on QUANTUM

- landing page: `/separation/`
- app: `/separation/app/`
- API: `/separation/api/`
- picam proxy: `/separation/camera/`

The intended public-facing origin for v0.2 is Tailnet-only.

If `:443` is already occupied by public Funnel-backed routes on QUANTUM, expose Brave Paws on a dedicated Tailnet-only HTTPS port instead. The current live deployment target is:

- `https://quantum.tail080401.ts.net:7447/separation/`
- `https://quantum.tail080401.ts.net:7447/separation/app/`
- `https://quantum.tail080401.ts.net:7447/separation/api/health`
- `https://quantum.tail080401.ts.net:7447/separation/camera/live.stream/`

## Local build and run

```bash
npm ci
npm run build
npm run server:start
```

Default bind:

- `http://127.0.0.1:4310/separation/`

## Environment variables

| Variable | Example |
| --- | --- |
| `BRAVE_PAWS_PUBLIC_BASE_URL` | `https://quantum.tail080401.ts.net` |
| `BRAVE_PAWS_DATA_DIR` | `/mnt/q/home/family/Brave Paws/data` |
| `BRAVE_PAWS_AUTH_TOKEN` | `replace-with-shared-secret-if-needed` |
| `BRAVE_PAWS_CAMERA_UPSTREAM_BASE_URL` | `http://127.0.0.1:18888/` |

## Session storage

Session data is stored in a human-inspectable JSON file:

- `${BRAVE_PAWS_DATA_DIR}/sessions.json`

## API surface

- `GET /separation/api/health`
- `GET /separation/api/sessions`
- `GET /separation/api/sessions/:id`
- `POST /separation/api/sessions`
- `PUT /separation/api/sessions/:id`
- `POST /separation/api/sync/pull`
- `POST /separation/api/sync/push`

## Suggested QUANTUM rollout

1. Build the repo: `npm run build`
2. Start locally: `npm run server:start`
3. Verify local routes with curl or a browser
4. Install `deploy/systemd/brave-paws.service`
5. Expose the server through Tailscale Serve so `/separation/...` stays Tailnet-only

## Notes

- The camera path is a same-origin proxy in front of picam / MediaMTX, so the app can consume the stream over HTTPS without the retired streamer helper.
- Local browser persistence still exists in the app; QUANTUM sync adds inspectable server-side storage instead of replacing the local-first UX.
