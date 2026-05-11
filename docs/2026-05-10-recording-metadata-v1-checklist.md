# Brave Paws recording metadata v1 checklist

Status: completed historical implementation checklist

> Historical note: this is a completed point-in-time checklist for the recording metadata v1 slice.
> Keep it as an audit trail for what shipped and where the smoke-test artifacts landed, not as an active runbook.
> For current recording behavior and server capability docs, prefer `../apps/brave-paws-server/README.md` and `./quantum-local-tailnet.md`.

- [x] Inspect current app/server/deploy recording flow and choose the least-fragile insertion points.
- [x] Add app-side runtime timeline event capture for active sessions, including actual step/session transitions.
- [x] Extend recording API payloads/contracts so stop/finalization receives the session snapshot + timeline metadata.
- [x] Implement server-side v1 sidecar generation adjacent to finalized MP4 recordings.
- [x] Derive VLC-friendly chapters from actual runtime timeline events and embed them into the MP4 best-effort.
- [x] Keep chapter embedding non-fatal so recordings are never lost on metadata failure.
- [x] Add meaningful automated tests for payload, sidecar, and chapter generation flow.
- [x] Build/lint/test the affected workspaces.
- [x] Produce an end-to-end smoke-test recording artifact on Q proving the flow.
- [x] Commit sensible checkpoints, push branch, and open/update a PR.

## Outputs

- PR: https://github.com/harvey-cash/separation-tracker/pull/65
- Smoke recording: `/mnt/q/fermi/brave-paws/smoke-tests/2026-05-10-recording-metadata-v1-rerun/server-data/recordings/2026/05/10/smoke-20260510T093538Z.mp4`
- Smoke sidecar: `/mnt/q/fermi/brave-paws/smoke-tests/2026-05-10-recording-metadata-v1-rerun/server-data/recordings/2026/05/10/smoke-20260510T093538Z.brave-paws.json`
- ffprobe chapter dump: `/mnt/q/fermi/brave-paws/smoke-tests/2026-05-10-recording-metadata-v1-rerun/ffprobe-chapters.json`
