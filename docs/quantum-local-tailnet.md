# Brave Paws v0.2 local Tailnet deployment

This repo now includes a single local-first server workspace for Brave Paws v0.2.

## What runs on QUARK

- landing page: `/separation/`
- app: `/separation/app/`
- API: `/separation/api/`
- picam proxy: `/separation/camera/`

The intended public-facing origin for v0.2 is Tailnet-only.

If `:443` is already occupied by public Funnel-backed routes on QUARK, expose Brave Paws on a dedicated Tailnet-only HTTPS port instead. The current live deployment target is:

- `https://quark.tail080401.ts.net:7447/separation/`
- `https://quark.tail080401.ts.net:7447/separation/app/`
- `https://quark.tail080401.ts.net:7447/separation/api/health`
- `https://quark.tail080401.ts.net:7447/separation/camera/live.stream/`

## Local build and run

```bash
npm ci
npm run build
npm run server:start
```

Default bind:

- `http://127.0.0.1:4310/separation/`

## Environment variables

| Variable | Current QUARK staging value |
| --- | --- |
| `BRAVE_PAWS_PUBLIC_BASE_URL` | `https://quark.tail080401.ts.net:7447` |
| `BRAVE_PAWS_CORS_ALLOWED_ORIGINS` | `https://harvey.cash,https://www.harvey.cash` |
| `BRAVE_PAWS_DATA_DIR` | `/mnt/q/fermi/brave-paws/data` |
| `BRAVE_PAWS_RECORDINGS_DIR` | `/mnt/s/Fermi/Separation Training Sessions/Brave Paws` |
| `BRAVE_PAWS_AUTH_TOKEN` | `replace-with-long-random-secret-before-enabling-pairing` |
| `BRAVE_PAWS_CAMERA_UPSTREAM_BASE_URL` | `http://127.0.0.1:18888/` |
| `BRAVE_PAWS_CAMERA_CONTROL_PROVIDER` | `command` |
| `BRAVE_PAWS_CAMERA_STATUS_COMMAND` | `/mnt/q/repos/separation-tracker-staging/deploy/scripts/brave-paws-picam-camera-control.sh status` |
| `BRAVE_PAWS_CAMERA_ENABLE_COMMAND` | `/mnt/q/repos/separation-tracker-staging/deploy/scripts/brave-paws-picam-camera-control.sh enable` |
| `BRAVE_PAWS_CAMERA_DISABLE_COMMAND` | `/mnt/q/repos/separation-tracker-staging/deploy/scripts/brave-paws-picam-camera-control.sh disable` |
| `BRAVE_PAWS_RECORDING_PROVIDER` | `command` |
| `BRAVE_PAWS_RECORDING_STATUS_COMMAND` | `/mnt/q/repos/separation-tracker-staging/deploy/scripts/brave-paws-picam-recording-control.sh status` |
| `BRAVE_PAWS_RECORDING_START_COMMAND` | `/mnt/q/repos/separation-tracker-staging/deploy/scripts/brave-paws-picam-recording-control.sh start` |
| `BRAVE_PAWS_RECORDING_STOP_COMMAND` | `/mnt/q/repos/separation-tracker-staging/deploy/scripts/brave-paws-picam-recording-control.sh stop` |

## Session storage

QUANTUM keeps a canonical JSON store plus a mirrored CSV export in the same data folder:

- `${BRAVE_PAWS_DATA_DIR}/sessions.json`
- `${BRAVE_PAWS_DATA_DIR}/brave_paws_sessions.csv`

If Harvey drops a fresher `brave_paws_sessions.csv` into the data folder, the server ingests it on the next read and rewrites the canonical JSON store.

Session recordings live separately under `${BRAVE_PAWS_RECORDINGS_DIR}` so the media archive sits on `S:` while the lighter session JSON/CSV store stays on `Q:`.

## API surface

- `GET /separation/api/health`
- `GET /separation/api/sessions`
- `GET /separation/api/sessions/:id`
- `POST /separation/api/sessions`
- `PUT /separation/api/sessions/:id`
- `POST /separation/api/sync/pull`
- `POST /separation/api/sync/push`

## Suggested QUARK rollout

1. Build the repo: `npm run build`
2. Start locally: `npm run server:start`
3. Verify local routes with curl or a browser
4. Install the staging automation and trigger the first refresh
   ```bash
   sudo /mnt/q/repos/separation-tracker/deploy/scripts/install-brave-paws-staging-automation.sh
   ```
5. Expose the server through Tailscale Serve so `/separation/...` stays Tailnet-only

## Automated QUARK live release-follow sync

For the durable live backend path that mirrors `harvey-dashboard`, keep a separate live clone on QUARK (recommended: `~/services/separation-tracker-live`) and install the release-follow timer there:

```bash
sudo ~/services/separation-tracker-live/deploy/scripts/install-brave-paws-cd-sync-timer.sh
```

The live release-follow job uses `deploy/systemd/brave-paws.live.service` as the canonical unit source for the dedicated live clone.

The live release-follow job:

- fetches repo tags and selects the highest `vX.Y.Z` release created by CD
- resets the live clone to that tagged commit on `main`
- runs `npm ci` and `npm run build`
- reinstalls the canonical `deploy/systemd/brave-paws.live.service`
- restarts `brave-paws.service`
- records the applied release in `~/.local/state/brave-paws/cd-sync-state.json`

That path is intentionally separate from the staging worktree automation below, so release-follow deploys do not fight with local dev/staging refreshes.

## Automated QUARK staging refresh

QUARK staging is meant to follow the local development repo's latest committed HEAD automatically, without hand-editing `/etc/systemd/system/brave-paws.service`.

The automation works like this:

- source repo: `/mnt/q/repos/separation-tracker`
- clean staging worktree: `/mnt/q/repos/separation-tracker-staging`
- live systemd unit: `/etc/systemd/system/brave-paws.service`
- refresh timer: `brave-paws-staging-refresh.timer`
- refresh job: `brave-paws-staging-refresh.service`

On each refresh, the script:

1. checks whether the source repo has a new committed HEAD
2. skips deployment if the source repo is dirty, so staging only follows committed states
3. resets the dedicated staging worktree to that committed revision
4. runs `npm ci` and `npm run build` in the staging worktree
5. installs the canonical `deploy/systemd/brave-paws.service` from the staging worktree into `/etc/systemd/system/`
6. restarts `brave-paws.service`
7. verifies `/separation/api/health` and `/separation/api/capabilities`

Manual checks:

```bash
systemctl status brave-paws-staging-refresh.timer --no-pager
systemctl status brave-paws-staging-refresh.service --no-pager
journalctl -u brave-paws-staging-refresh.service -n 100 --no-pager
```

Expected refresh-service behavior:

- `brave-paws-staging-refresh.service` is a `Type=oneshot` job, so a healthy run normally ends as `inactive (dead)` with `status=0/SUCCESS` after finishing.
- The refresh script includes a bounded readiness retry loop after restarting `brave-paws.service`, so a brief server startup delay should no longer cause a false failed deploy.

## Notes

- The camera path is a same-origin proxy in front of picam / MediaMTX, and directory-style preview URLs such as `/separation/camera/live.stream` are redirected to the working trailing-slash preview page automatically.
- `deploy/systemd/brave-paws.service` is the canonical QUARK staging unit, but the live copy should now be refreshed automatically by `brave-paws-staging-refresh.service` instead of hand-editing `/etc/systemd/system/brave-paws.service`.
- QUARK's deployment now wires the generic camera-streaming capability API to the existing OpenClaw picam privacy-toggle skill through `deploy/scripts/brave-paws-picam-camera-control.sh`, so the Brave Paws dashboard toggle and session lifecycle automation drive the same underlying picam enable/disable behavior as the assistant skill.
- QUARK's deployment also wires the generic recording capability API to `deploy/scripts/brave-paws-picam-recording-control.sh`, so the app footer/active-session recording controls reflect the same backend capability contract used in tests.
- If the hosted `harvey.cash` frontend cannot connect to the Tailnet backend root, check CORS first: the QUARK backend must include `BRAVE_PAWS_CORS_ALLOWED_ORIGINS=https://harvey.cash,https://www.harvey.cash` and `/separation/api/capabilities` should report both `cameraStreaming.provider = "command"` and `sessionRecording.provider = "command"`.
- If you enable pairing, also set `BRAVE_PAWS_AUTH_TOKEN`; otherwise the HTTP pairing-creation endpoint stays disabled on purpose and only the local CLI can mint tokens.
- Local browser persistence still exists in the app; QUARK hydrates on open and automatically pushes changes back to the inspectable QUARK data folder.
