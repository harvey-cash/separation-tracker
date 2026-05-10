# Brave Paws recording metadata v1 checklist

- [x] Inspect current app/server/deploy recording flow and choose the least-fragile insertion points.
- [x] Add app-side runtime timeline event capture for active sessions, including actual step/session transitions.
- [x] Extend recording API payloads/contracts so stop/finalization receives the session snapshot + timeline metadata.
- [x] Implement server-side v1 sidecar generation adjacent to finalized MP4 recordings.
- [x] Derive VLC-friendly chapters from actual runtime timeline events and embed them into the MP4 best-effort.
- [x] Keep chapter embedding non-fatal so recordings are never lost on metadata failure.
- [x] Add meaningful automated tests for payload, sidecar, and chapter generation flow.
- [x] Build/lint/test the affected workspaces.
- [x] Produce an end-to-end smoke-test recording artifact on Q proving the flow.
- [ ] Commit sensible checkpoints, push branch, and open/update a PR.
