# Brave Paws pairing slice — implementation plan

## Current state
- The app already supports deep links that embed the raw `cameraUrl` in the query string and then caches the chosen stream in browser storage.
- Runtime defaults fall back to same-origin paths, but the app copy/examples still assume a QUANTUM-specific shortcut and direct stream URL.
- The server exposes sync + camera proxy endpoints, but there is no broker for opaque pairing links.

## Smallest safe next step
1. Add a server-side pairing broker that stores an opaque token -> camera launch config mapping and returns a one-time pairing URL.
2. Make the broker opt-in and auth-protected for writes so public deployments stay safe by default.
3. Teach the app to resolve `pairingToken` links through the API, cache the resolved stream locally, and then strip the token from the URL.
4. Remove private-host defaults from app examples/tests/copy so the public frontend bundle does not ship QUANTUM-specific URLs by default.
5. Add targeted app/server tests for token resolution, config safety, and pairing creation/consumption.

## Follow-up after this slice
- If Harvey wants truly public `harvey.cash` pairing into a private QUANTUM backend, add a dedicated public broker deployment that can mint/consume tokens without exposing the private origin itself.
