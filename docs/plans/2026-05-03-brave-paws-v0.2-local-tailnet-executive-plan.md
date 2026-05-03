# Brave Paws v0.2 — local Tailnet hosting and QUANTUM backend

Date: 2026-05-03
Owner: Harvey + Quantum
Repo: `Q:/repos/separation-tracker`
Status: proposed execution plan / handoff brief

## Executive summary

Brave Paws v0.2 should move from a purely client-side app with optional Google Drive backup to a **local-first app with a QUANTUM-hosted backend and QUANTUM-hosted frontend, exposed over Tailnet only**.

This should be treated as a **single-user, Harvey-first deployment** without prematurely designing for a generic public SaaS. However, the implementation should still preserve a clean architectural boundary so the app remains open-sourceable later.

### Recommendation

Build v0.2 around these principles:

1. **Keep Brave Paws local-first** in the browser.
2. **Replace direct Google Drive coupling with a sync-provider boundary**.
3. Implement **QUANTUM-over-Tailnet as the first real backend/sync provider**.
4. Have **QUANTUM serve the landing page, app, and backend API** from one local deployment.
5. Keep everything **Tailnet-only** for now; do **not** deploy to `harvey.cash` yet.
6. Use a **feature branch + PR workflow** so development can move quickly without triggering current `main`-only CD.
7. Widen CI so **all feature branches / arbitrary branch names** get validated, while CD remains `main`-only.

This gives the immediate benefits Harvey wants:
- easier inspection of session data
- better support for training management
- simpler dev cycles
- simpler local staging
- a natural path for future picam integration

while avoiding the trap of hard-coding "Harvey's exact home setup" into the product core.

---

## Why this work is worth doing now

The current architecture was reasonable for an early public-friendly prototype, but it is now getting in the way of the actual use case.

### Current pain points

- Google Drive backup is an awkward fit for active development and observability.
- Quantum cannot easily inspect or reason about generated session data in-place.
- Staging and iteration are more awkward than they need to be.
- The app still assumes hosted production URLs in several places, and the old streamer architecture leaves behind scope and deployment baggage that v0.2 no longer needs.
- The current design is optimized for hypothetical generic distribution more than Harvey's real near-term needs.

### Expected benefits of v0.2

- Quantum can inspect, summarize, and help manage session history directly.
- Harvey gets faster iteration on the actual product he uses.
- Local staging becomes much easier.
- Future integrations become more natural:
  - picam session correlation
  - training analytics
  - notes / review workflows
  - admin or coaching surfaces
- Public/open-source release remains possible because the backend is treated as a provider, not the only possible architecture.

---

## Current state snapshot

This section is here so a follow-on agent does not need to rediscover the basics.

### Repo structure today

The repo is an npm workspaces monorepo with three main surfaces today:

1. `apps/brave-paws-landing`
2. `apps/brave-paws-app`
3. `apps/brave-paws-streamer` (to be retired/removed from v0.2 scope)

### Product behavior today

- Brave Paws App is currently **client-side React + TypeScript**.
- Session data is stored locally in the browser.
- There is optional **Google Drive backup/sync**.
- There is also an older **Windows helper + hosted UI streamer** model, which should be treated as retired architecture for v0.2 and removed aggressively rather than carried forward.

### Important implementation facts already visible in the repo

#### Frontend hosting assumptions

Hard-coded production path assumptions exist today:

- `apps/brave-paws-app/vite.config.ts` uses `base: '/separation/app/'`
- `apps/brave-paws-landing/vite.config.js` uses `base: '/separation/'`
- `apps/brave-paws-app/src/utils/cameraUrl.ts` hard-codes `https://harvey.cash/separation/app/`
- old streamer docs/tests/assets refer to `https://harvey.cash/separation/streamer/`

#### Streamer retirement status

The repo still contains the older streamer surface (`apps/brave-paws-streamer`) and related docs/tests/assets.

For v0.2, the correct direction is **not** to adapt that Windows helper to the new local deployment. The correct direction is to **remove it thoroughly** and simplify the architecture around directly consuming the existing `picam` video+audio stream.

#### Google Drive coupling status

The app currently includes dedicated Google Drive components/hooks/utils:

- `src/components/GoogleDriveSync.tsx`
- `src/hooks/useGoogleDrive.ts`
- `src/utils/googleDrive.ts`
- associated tests

So there is real implementation coupling, not just a thin adapter.

#### CI/CD state today

Current GitHub Actions behavior:

- `CI` runs on push to:
  - `main`
  - `feature/*`
- `CI` also runs on PRs targeting `main`
- `CD` runs only from `main`

So CD is already `main`-only, which is good.

However, CI is **not** currently guaranteed for arbitrary branch names. If development happens on branches outside `feature/*`, CI may be skipped.

#### Existing picam/Tailnet context

Quantum already bridges `picam` through QUANTUM on Tailnet.

Known current endpoints:

- RTSP: `rtsp://100.120.103.101:8554/live.stream`
- HLS/browser: `http://100.120.103.101:8888/live.stream/`

That is useful context, but it is **not yet a finished Brave Paws v0.2 architecture**.

---

## Product and architecture goals

## Primary goals

1. **Run Brave Paws entirely locally at first** from QUANTUM over Tailnet.
2. **Replace direct dependence on Google Drive backup** with a QUANTUM-hosted backend path.
3. **Let Quantum inspect and reason about session data** safely and directly.
4. **Preserve a clean path to future open-source reuse**.
5. **Avoid triggering public deployment workflows** while v0.2 is being built.
6. **Enable easy local staging**.

## Secondary goals

- Make the hosted paths consistent with future public deployment.
- Reduce environment-specific hard-coding.
- Leave room for future picam-aware workflows.
- Keep the repo pleasant for incremental PRs.

## Non-goals for v0.2

- multi-user SaaS
- public internet deployment
- polished auth for untrusted users
- deep trainer/customer account systems
- automatic training scheduling
- full public cloud architecture

This is a **Harvey-first, single-user local deployment**.

---

## Core architectural decision

## Recommended architecture

### 1) Keep the app local-first

The browser should still work as the primary interaction surface and still maintain local state robustly enough for good UX and offline-ish behavior.

That means:
- browser remains a first-class source of truth during active use
- local persistence remains available
- backend sync augments the app; it does not turn Brave Paws into a fragile always-online thin client

### 2) Introduce a sync/storage provider boundary

Do **not** replace Google Drive with ad-hoc QUANTUM-specific calls scattered through the UI.

Instead, introduce a boundary such as:
- `SyncProvider`
- `SessionRepository`
- or equivalent

This boundary should let the app talk to one of several backends:
- `local-only`
- `google-drive` (legacy/optional)
- `quantum-api` (new default for Harvey)

This is the key move that preserves future open-source flexibility.

### 3) Add a QUANTUM-hosted backend as the first serious provider

The QUANTUM backend should be the default path for Harvey's real usage.

Recommended shape:
- Node/TypeScript service inside the monorepo
- exposes JSON API over localhost on QUANTUM
- persisted storage on QUANTUM
- served to Tailnet using Tailscale Serve / reverse proxy

### 4) Have QUANTUM serve the frontend too

QUANTUM should serve:
- landing site
- app build
- backend API

This keeps v0.2 coherent and makes local staging much simpler.

### 5) Preserve `/separation/...` path structure locally

Recommended local path layout:

- `https://quantum.tail080401.ts.net/separation/`
- `https://quantum.tail080401.ts.net/separation/app/`
- `https://quantum.tail080401.ts.net/separation/api/...`
- optional future stream-facing path(s) under the same origin if needed, but **no separate streamer app for v0.2**

Reason:
- minimizes path churn vs current production assumptions
- makes later migration back to `harvey.cash/separation/...` much easier
- reduces risk around Vite base paths and pairing URLs

---

## Recommended deployment topology on QUANTUM

## Public-facing scope

Tailnet-only for now.

Recommended canonical origin:
- `https://quantum.tail080401.ts.net`

Do not expose publicly.
Do not wire this into `harvey.cash` yet.

## Local services on QUANTUM

Recommended deployment shape:

1. **Brave Paws server process** on localhost
   - serves static built assets
   - exposes API routes
2. **Persistent data directory** on QUANTUM
3. **Systemd service** for Brave Paws server
4. **Tailscale Serve** exposing the service over HTTPS to the tailnet

### Preferred service shape

Recommended new workspace/service:
- `apps/brave-paws-server`
  - or `services/brave-paws-server`

Responsibilities:
- serve built `landing` and `app` assets
- expose `/separation/api/...`
- expose health endpoints
- read/write persistent session data
- optionally expose minimal admin/inspection endpoints later

### Why one server is the recommended default

One local service simplifies:
- deployment
- staging
- path handling
- env handling
- same-origin browser API calls
- Tailnet exposure

It is lower-friction than separately hosting static assets and API behind multiple local services.

---

## Storage and backend recommendation

## Default recommendation

Use a QUANTUM-hosted persistence layer behind a repository boundary.

### Recommended v0.2 storage posture

Start pragmatic:
- single user
- inspectable on disk
- easy to back up
- easy to debug

### Storage implementation options

#### Option A — SQLite (recommended if tooling stays simple)

Pros:
- structured
- easy querying for training review
- good basis for analytics/admin later
- still local and inspectable

Cons:
- introduces backend persistence tooling choices
- may add dependency/build complexity depending on package choice

#### Option B — JSON/NDJSON on disk behind a backend API

Pros:
- simplest implementation
- extremely inspectable
- low dependency friction

Cons:
- analytics and concurrency become clumsier over time
- more migration work later if the product grows

### Recommendation

Prefer **SQLite if it can be done without making CI/development miserable**.
If backend/tooling friction starts slowing delivery, fall back to **structured JSON-on-disk behind the same repository interface**.

The important thing is **the interface boundary**, not the exact first persistence mechanism.

---

## Backend API direction

The backend API should be simple and boring.

## v0.2 API goals

- upload/save session data
- fetch session history
- support sync conflict handling sanely
- expose enough data for Quantum to inspect training history
- support future local admin pages / summaries

## Suggested first API surface

Minimum useful set:

- `GET /separation/api/health`
- `GET /separation/api/sessions`
- `GET /separation/api/sessions/:id`
- `POST /separation/api/sessions`
- `PUT /separation/api/sessions/:id`
- `POST /separation/api/sync/pull`
- `POST /separation/api/sync/push`

The exact endpoint names can change, but the split should support both:
- CRUD-ish server access
- sync-style client workflows

## Auth/security for v0.2

Because this is Tailnet-only and single-user, auth can be lightweight.

Recommended approach:
- trust Tailnet boundary first
- optionally add a simple shared secret / token for API writes
- do not spend v0.2 inventing a full auth product

---

## Frontend changes required

## 1) Remove hard-coded production URLs

This is mandatory.

### App

Refactor the app so that pairing/app URLs come from configuration, not hard-coded `harvey.cash` constants.

Key touchpoints:
- `apps/brave-paws-app/src/utils/cameraUrl.ts`
- `apps/brave-paws-app/vite.config.ts`
- tests that assert `harvey.cash` URLs

### Removal of streamer-specific assumptions

The old streamer stack should be removed rather than migrated.

Key touchpoints:
- `apps/brave-paws-streamer/` and its subfiles
- README/docs/tests/assets referencing the streamer or `harvey.cash/separation/streamer/`
- CI/release steps that still validate or package the streamer
- copy in the landing/app that points users toward the retired Windows companion

### Landing page

Update hosted-path assumptions so local QUANTUM hosting is a first-class documented/runtime mode.

## 2) Replace direct Google Drive UX coupling with a provider abstraction

The dashboard should not think in terms of "Google Drive sync" as the only cloud concept.

Instead:
- generalize the UI into a sync/storage section
- support provider-specific implementations under a shared interface

Possible UX wording:
- `Storage`
- `Sync`
- `Backup & Sync`

with provider-specific states under that.

## 3) Keep local browser persistence

Do not remove browser-local session persistence unless there is a strong reason.

Recommended behavior:
- local data still exists
- backend sync becomes primary for Harvey's deployed instance
- import/export remains available

---

## Camera implications for v0.2

This is important because Brave Paws is not just CRUD.

## v0.2 camera direction

Brave Paws Streamer should **not** exist in v0.2.

The frontend should simply consume an already-available camera stream, and for Harvey that source is `picam`, which already provides video + audio.

That means v0.2 should:
- remove the old Windows streamer surface entirely
- remove hosted-streamer assumptions from docs, tests, UI copy, CI, and release flow
- simplify the app so camera input is just a configured/remembered stream origin consumed by the frontend

## Picam implication

Picam is no longer "future-compatible extra scope"; it is the intended camera source for v0.2.

Recommended stance:
- ensure camera URLs can point to a QUANTUM-hosted/Tailnet HTTPS origin
- if needed, have QUANTUM present a clean same-origin or same-tailnet stream-facing path in front of picam
- aggressively simplify the app around "consume stream" rather than "pair with helper"
- remove assumptions that a separate Windows helper, QR pairing flow, or hosted control UI must exist

Important note: the app currently only accepts `https:` camera URLs except for localhost `http:`. That means current raw `http://100.120.103.101:8888/...` style Tailnet camera URLs are not a clean long-term fit for the app UX. v0.2 should therefore prefer a QUANTUM-served HTTPS-compatible camera origin/path in front of picam, or otherwise update the validation/path strategy intentionally rather than inheriting old streamer-era assumptions.

---

## CI / CD / branching plan

## Recommendation

Use a long-lived feature branch for v0.2 work and merge via regular PRs.

Suggested branch name:
- `quantum/brave-paws-v0.2-local-tailnet`

A shorter Harvey-owned variant is also fine if preferred.

## CI changes required

Current CI only guarantees push validation for `main` and `feature/*`.

Recommended change:
- update CI to run on **all normal branches** (or at minimum all branches used for development), not just `feature/*`

Goal:
- any working branch name should get tests/lint/build/e2e as appropriate

## CD posture

Keep CD `main`-only.

That means:
- feature branch pushes do **not** deploy
- PRs can happen regularly
- `main` remains the public-release/deploy line

## Suggested CI policy for v0.2 branch work

On non-`main` branches, require at least:
- install
- unit tests
- typecheck/lint
- app build
- any backend tests added for v0.2

If e2e becomes too heavy for every branch push, keep it on PRs and/or important pushes, but prefer not to silently lose coverage.

---

## Local staging recommendation

v0.2 should make staging easy.

## Preferred approach

Support at least two local environments on QUANTUM:

1. **dev**
   - live-reload / local commands
   - localhost ports
2. **staging-like deployed local instance**
   - built assets
   - real server process
   - real Tailnet URL/path
   - separate data store from production-like local instance if needed

## Minimal useful staging split

- `production-like local`: `.../separation/...`
- optional preview/staging path such as `.../separation-preview/...`
  - or separate localhost/systemd unit

The key point is that local staging should validate the real deployment shape, not just `vite dev`.

---

## Suggested execution phases

## Phase 0 — planning and branch setup

Deliverables:
- create v0.2 feature branch
- confirm branch naming convention
- widen CI branch coverage
- document env/config strategy

## Phase 1 — hosting/config abstraction

Deliverables:
- remove hard-coded `harvey.cash` assumptions from app paths
- parameterize app URL / API base as needed
- preserve `/separation/...` path structure
- prove the stack can build for QUANTUM-hosted URLs
- identify and begin removing streamer-era assumptions from docs/UI/tests

## Phase 2 — QUANTUM backend skeleton

Deliverables:
- add local backend/server workspace
- health endpoint
- persistent data directory/config
- ability to serve built frontend assets locally
- systemd-friendly startup command

## Phase 3 — session persistence and sync

Deliverables:
- backend storage layer
- session CRUD or sync endpoints
- frontend provider abstraction
- QUANTUM sync provider implemented
- Google Drive either deprecated, hidden, or retained as legacy provider behind the same interface

## Phase 4 — QUANTUM deployment over Tailnet

Deliverables:
- local server running on QUANTUM
- systemd unit installed
- Tailnet HTTPS exposure working
- local deployed origin reachable from Harvey devices
- app + landing working from QUANTUM origin
- picam-backed stream consumption working cleanly in the frontend

## Phase 5 — validation and cleanup

Deliverables:
- docs updated
- tests updated
- branch ready for PR
- explicit checklist of remaining gaps before any later `harvey.cash` deployment

---

## Concrete repo touchpoints likely to change

This section is intentionally operational.

## CI/CD

- `.github/workflows/ci.yml`
- possibly docs around release/deploy expectations

## App

- `apps/brave-paws-app/src/App.tsx`
- `apps/brave-paws-app/src/utils/cameraUrl.ts`
- `apps/brave-paws-app/src/hooks/useGoogleDrive.ts`
- `apps/brave-paws-app/src/components/GoogleDriveSync.tsx`
- `apps/brave-paws-app/vite.config.ts`
- app tests covering URLs/sync behavior

## Landing

- `apps/brave-paws-landing/vite.config.js`
- copy/docs that assume public hosting only

## Streamer removal / cleanup

- `apps/brave-paws-streamer/` and its subfiles for deletion or archival removal
- streamer tests/docs/assets with hard-coded production URLs
- any app/landing copy that references the retired streamer companion
- CI/release workflow steps that still test, package, or publish streamer artifacts

## New backend/server

Likely new workspace, for example:
- `apps/brave-paws-server/`

Potential contents:
- `package.json`
- `src/server.ts`
- `src/config.ts`
- `src/routes/...`
- `src/storage/...`
- `src/types/...`

## Deployment/config docs

Add repo-local docs for:
- local QUANTUM hosting
- env vars
- data location
- systemd service setup
- Tailnet exposure steps

---

## Recommended configuration model

Use explicit environment variables rather than hard-coded hostnames.

## Recommended variables

For app/server deployment:
- `BRAVE_PAWS_PUBLIC_BASE_URL`
- `BRAVE_PAWS_APP_URL`
- `BRAVE_PAWS_API_BASE_URL`
- `BRAVE_PAWS_DATA_DIR`
- `BRAVE_PAWS_AUTH_TOKEN` (optional/simple)
- optional stream base/origin variable if the frontend should derive the picam-facing URL from config

For retaining legacy Google Drive support if desired:
- `VITE_GOOGLE_CLIENT_ID`

Streamer-specific environment variables should be removed with the retired streamer surface unless a narrowly-scoped migration shim temporarily needs them during cleanup.

---

## Risks and mitigations

## Risk: over-engineering for hypothetical future users

Mitigation:
- explicitly optimize for Harvey-first single-user deployment
- preserve abstraction boundaries, but do not build multi-tenant infrastructure now

## Risk: replacing Google Drive too aggressively and breaking data continuity

Mitigation:
- keep import/export path
- support staged migration of existing session history
- treat Google Drive as a legacy provider during transition if useful

## Risk: leftover streamer-era assumptions contaminate the new design

Mitigation:
- treat streamer removal as explicit scope, not optional cleanup
- keep `/separation/...` path structure for the surviving surfaces
- centralize config
- update tests/copy/docs that still assume pairing via a separate helper

## Risk: backend dependency complexity slows delivery

Mitigation:
- prefer simple Node/TypeScript service
- choose boring storage
- fall back to JSON-on-disk if SQLite complexity becomes a time sink

## Risk: staging and deployed-local environment drift

Mitigation:
- test a real built deployment on QUANTUM early, not only local dev mode

---

## Acceptance criteria for v0.2 milestone

Brave Paws v0.2 is successful when all of the following are true:

1. Brave Paws can be opened at a QUANTUM Tailnet URL.
2. The landing page and app are served by QUANTUM.
3. Session data can be saved and retrieved through the QUANTUM backend.
4. Quantum can inspect the stored data directly on QUANTUM.
5. The frontend can consume the intended picam video+audio stream cleanly without Brave Paws Streamer.
6. The old streamer surface and its obvious leftover edges have been removed or explicitly retired behind a short-lived cleanup shim.
7. The app is no longer hard-coupled to Google Drive as its only sync story.
8. Feature branch work gets CI without triggering public CD.
9. The repo is still in a shape that can later be adapted back to `harvey.cash` deployment.

---

## Explicit recommendation on Google Drive

Do **not** make Google Drive the core persistence path for v0.2.

Recommended treatment:
- demote Google Drive from primary architecture to optional/legacy provider
- keep only if it remains cheap to support
- do not let it dictate the new architecture

This aligns with Harvey's actual priorities and makes Quantum materially more useful.

---

## Handoff instructions for the next agent session

The next agent should treat this as an implementation brief, not just a research note.

## Mission

Implement Brave Paws v0.2 so QUANTUM serves the frontend and backend locally over Tailnet, the app consumes picam directly, and the old Brave Paws Streamer architecture is removed cleanly.

## First actions

1. Create or switch to the v0.2 feature branch.
2. Audit and remove hard-coded `harvey.cash` assumptions.
3. Update CI branch triggers so arbitrary feature branches run checks.
4. Add the backend/server workspace skeleton.
5. Remove or quarantine the Brave Paws Streamer surface and its leftover references.
6. Make a local QUANTUM-hosted build of:
   - landing
   - app
7. Introduce the sync/provider abstraction in the app.
8. Implement the QUANTUM backend provider.
9. Prove local Tailnet access works end-to-end, including clean picam consumption from the frontend.

## Important constraints

- Tailnet-only for now
- no `harvey.cash` deployment yet
- do not break the future path back to public hosting
- do not overbuild multi-user auth/platform concerns
- keep changes incrementally PR-able

## Recommended sequence of PRs

### PR 1
Infrastructure/config cleanup:
- CI branch widening
- URL/config abstraction
- docs for local QUANTUM-hosted mode

### PR 2
Backend/server skeleton:
- new server workspace
- health endpoint
- local static serving
- deployment docs/scripts

### PR 3
Data layer + provider abstraction:
- frontend sync abstraction
- QUANTUM provider
- session persistence
- migration path from current local/Drive model

### PR 4
Streamer removal + picam consumption cleanup:
- remove streamer surface and references
- simplify frontend camera flow around consuming picam
- clean CI/release/docs leftovers
- full local Tailnet validation

### PR 5
Polish / cleanup:
- docs
- tests
- optional legacy Google Drive compatibility cleanup
- final sweep for streamer-era leftovers

---

## Final recommendation in one sentence

Build Brave Paws v0.2 as a **Harvey-first, local-first, QUANTUM-hosted Tailnet app with a clean backend/provider boundary, direct picam consumption, and no Brave Paws Streamer baggage**, and use branch/CI changes to make iterative PR development safe without waking up public deployment.
