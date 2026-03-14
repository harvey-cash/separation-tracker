# Brave Paws Streamer Static-Hosting Feasibility Spike

## Executive Summary

It is **not realistic to make Brave Paws Streamer fully deployable as a pure GitHub Pages app with no local native component** while preserving the current experience.

The current streamer depends on capabilities that a static website cannot perform on its own:

- starting and supervising `go2rtc.exe` and `cloudflared.exe`
- discovering Windows DirectShow cameras and microphones via `ffmpeg`
- writing local `go2rtc.yaml` configuration
- opening and stopping long-running local processes
- exposing a laptop-local media server through a secure public tunnel

Those responsibilities currently live in `apps/brave-paws-streamer/windows-camera-helper-ui/server.cjs`, while the browser UI is only a thin local client over `/api/*`.

The most feasible path to `https://harvey.cash/separation/streamer` is therefore:

> **move the UI to static hosting, but keep a small local trusted helper running on the laptop**

That would let users open a hosted page that looks almost identical to the current streamer, while a local helper continues to handle device access, process management, and tunnel creation.

## Current Architecture Snapshot

Today the Windows bundle is fundamentally a **local control plane plus local web UI**:

- `windows-camera-helper-ui/server.cjs` serves the UI, enumerates devices, downloads dependencies, starts `go2rtc.exe`, starts `cloudflared.exe`, generates the QR code, and exposes `/api/bootstrap`, `/api/status`, `/api/start`, and `/api/stop`.
- `windows-camera-helper-ui/public/app.js` polls those local endpoints and renders the controls, preview, QR code, and logs.
- `windows-camera-helper-ui/health-check.mjs` validates the flow by booting the server, calling the local API, starting a stream, checking for a secure URL and QR code, and stopping cleanly.
- `windows-camera-helper-ui/package-portable.mjs` packages that local server into `BravePawsStreamer.exe`.
- `windows-camera-helper-ui/streamer-assets.cjs` defines the runtime downloads for `go2rtc`, `cloudflared`, and `ffmpeg`.
- `apps/brave-paws-app/src/utils/cameraUrl.ts` shows that Brave Paws App stores a base camera URL and derives the playable stream URL by appending `/stream.html?src=camera&mode=mse`.

That last point is important: the checked-in app is currently optimized around a **tunneled go2rtc web playback endpoint**, not a brand-new browser-native WebRTC signaling flow. go2rtc may support WebRTC modes, but a pure browser-first WebRTC architecture would still be a broader redesign than "host the current streamer UI on GitHub Pages".

That means the existing design already has a useful separation:

1. a **control UI** rendered in HTML/CSS/JS
2. a **native/local orchestration layer** that the UI depends on

Static hosting can replace only the first half unless the overall architecture changes materially.

## What GitHub Pages Can And Cannot Do

### What a static site can do well

- serve the streamer UI shell from `harvey.cash/separation/streamer`
- render controls, status, logs, QR codes, and instructions
- call browser APIs such as `getUserMedia` if the user grants permission
- connect to an existing remote stream URL
- talk to a local helper over loopback HTTP/WebSocket if the browser allows it

### What a static site cannot do by itself

- install or launch `go2rtc`, `cloudflared`, or `ffmpeg`
- enumerate Windows devices the same way the current helper does
- keep long-running media/tunnel processes alive independently of the tab
- safely expose laptop-local services to the internet without another trusted component
- provide signaling, TURN, access control, or relay infrastructure for browser-to-browser WebRTC on its own

The key conclusion is that **GitHub Pages can host the control surface, but it cannot replace the local streaming agent**.

## Security Constraint To Preserve

If the streamer becomes a hosted page, the security boundary becomes more important, not less.

Right now the helper is local and self-contained. A hosted page talking to a localhost helper introduces a new risk:

- a malicious website could try to call the same localhost API

Any static-hosted approach that keeps a local helper should therefore include all of the following:

- bind helper APIs to `127.0.0.1` only
- require an allowlisted `Origin` such as `https://harvey.cash`
- require a per-launch nonce or session token so `Origin` alone is not the only control
- avoid unauthenticated `start`/`stop` endpoints on localhost
- continue generating fresh per-session public stream URLs
- ideally add a second secret beyond the bare tunnel URL if the remote stream should resist accidental sharing

This matters because the current tunnel model is encrypted in transit, but the viewer URL itself is still a bearer secret.

## Approaches Compared

| Approach | What changes | UX parity with current app | Engineering effort | Security posture | Ease | Elegance |
|---|---|---:|---:|---|---|---|
| A. Pure static page, browser-only capture, no local helper | Use `getUserMedia` in the page and attempt direct browser streaming | Low | High | Weak to moderate unless a real relay/signaling layer is added | Low | Medium |
| B. Static page + localhost native helper using existing tunnel stack | Host UI on GitHub Pages, keep a small local helper that runs go2rtc/cloudflared/ffmpeg | High | Moderate | Strong if loopback API is origin- and token-protected | **High** | **High** |
| C. Static page + browser extension + native messaging host | Hosted UI delegates privileged actions through an extension | Medium | High | Strong if implemented carefully | Medium-low | Low |
| D. Static page + managed relay service replacing go2rtc/cloudflared | Redesign around a hosted signaling/TURN/SFU service | Medium-high eventually | Very high | Potentially strongest, but operationally largest | Low near-term | Highest long-term |

### Approach A: Pure static browser-only streamer

This is the only option that is truly "just GitHub Pages", but it does **not** match the current product shape very well.

Pros:

- no local executable
- simplest deployment story for the UI
- browser camera permission flow is familiar

Cons:

- the stream only lives while the tab is open and healthy
- the page cannot launch or supervise `cloudflared`
- there is no obvious secure way to expose a browser-originated stream over the public internet without adding backend signaling/TURN infrastructure
- device handling becomes browser-dependent rather than Windows-helper-controlled
- it diverges from the current Brave Paws playback contract, which expects a tunneled go2rtc-style URL rather than a new signaling stack
- Brave Paws would stop looking like the current "launch once, get QR, keep laptop running" model

Bottom line: **not feasible for "almost identical" behavior** unless the product is redesigned around a hosted real-time media service.

### Approach B: Static page + localhost native helper

This is the closest fit to the current implementation.

The idea:

1. keep a lightweight local helper installed on Windows
2. move the UI itself to `harvey.cash/separation/streamer`
3. let the hosted page talk to the helper over `http://127.0.0.1:<port>` or a local WebSocket
4. keep `go2rtc`, `cloudflared`, dependency download, device enumeration, and QR generation in the local helper

Why it fits the repo well:

- `server.cjs` already exposes a clean local API surface
- `public/app.js` is already a browser client that could be repointed to a hosted origin
- the native responsibilities are already concentrated in one place
- the Brave Paws App pairing flow can stay almost unchanged because the helper can still produce the same base secure URL

Main required refactor:

- split the current combined server into:
  - a **headless local helper API**
  - a **hosted static UI**

Recommended security additions:

- random per-launch local auth token
- strict `Origin` validation
- optional custom URL path or tokenized viewer URL on the tunneled side

Bottom line: **feasible and the best near-term blend of ease and elegance**.

### Approach C: Static page + browser extension/native messaging

In this model, the hosted page talks to a browser extension, and the extension talks to a native host that manages streaming.

Pros:

- strong separation between hosted UI and privileged local operations
- extension APIs can mediate access more explicitly than open localhost HTTP

Cons:

- worst install story for mainstream users
- browser-store policy/review friction
- browser-specific support burden
- less elegant than a small helper with a loopback API

Bottom line: technically feasible, but the product experience becomes more cumbersome than the current `.exe`.

### Approach D: Hosted relay architecture

This is the cleanest long-term architecture if the goal is eventually "open a website and stream" with minimal native software.

A redesigned version would likely use:

- browser capture or a local helper capture agent
- hosted signaling
- TURN for NAT traversal
- possibly an SFU or media relay
- authenticated sessions instead of public tunnel URLs

Pros:

- most elegant end-state architecture
- better foundation for access control, revocation, and multi-viewer support
- less dependence on `cloudflared` and a tunneled localhost media server
- the most natural place to introduce true browser-first WebRTC rather than tunneled `stream.html?src=camera&mode=mse`

Cons:

- much larger product and infrastructure investment
- introduces backend operations and cost
- no longer fits the current "static site only" constraint

Bottom line: **best long-term architecture, but not a GitHub Pages-only solution and not a small follow-up to the current repo**.

## Recommended Direction

If the target is:

> users visit `harvey.cash/separation/streamer` and use Brave Paws Streamer almost exactly like the current Windows bundle

then the recommended direction is:

### Recommendation: hosted UI + local helper API

Keep these local:

- device enumeration
- go2rtc configuration and lifecycle
- cloudflared lifecycle
- FFmpeg resolution and download
- QR code payload generation or secure URL generation

Move these to static hosting:

- page layout and branding
- controls and logs UI
- onboarding instructions
- status polling and rendering

This preserves the current mental model:

1. install Brave Paws Streamer once
2. visit `harvey.cash/separation/streamer`
3. the page detects the local helper
4. select camera/mic
5. start stream
6. scan QR code in Brave Paws App

That is very close to today's flow, but with the UI deployed centrally instead of packaged into the executable.

## Suggested Migration Shape

### Phase 1: Separate local orchestration from local static assets

Refactor the current helper so that it can run with no bundled browser assets at all, exposing only JSON/WebSocket APIs over loopback.

### Phase 2: Host the existing UI on `harvey.cash/separation/streamer`

Adapt the current `public/app.js` logic so the hosted page can:

- detect whether the helper is running
- prompt the user to install/start it if missing
- authenticate to the helper using a local session token

### Phase 3: Improve localhost trust boundaries

Before shipping a hosted UI, add:

- origin checks
- CSRF-style local session token protection
- explicit helper "pair" or "approve this page" behavior if needed

### Phase 4: Decide whether tunnel URLs need stronger viewer protection

If "secure fashion" should mean more than "unguessable temporary URL over TLS", consider:

- random secret path segments
- signed viewer tokens
- an authenticated proxy in front of the stream

That is optional for the static-hosting move, but important if the product needs stronger access control than the current temporary public URL model.

## Overall Feasibility Verdict

### Can Brave Paws Streamer become a pure statically hosted site?

**No, not without changing the product substantially.**

A static site alone cannot replace the local process-management and device-integration work that the current Windows helper performs.

### Can Brave Paws Streamer use a statically hosted UI while still tunneling a secure live stream in roughly the same way as today?

**Yes.**

That is the most practical and elegant route:

- keep a small local helper
- host the UI centrally
- preserve the current `go2rtc + cloudflared` tunnel model
- harden localhost communication before exposing the control surface on a public origin

## Final Recommendation

For near-term delivery, pursue **Approach B: statically hosted UI plus localhost native helper**.

It is:

- the **easiest** approach that still preserves the current user experience
- the **most elegant** approach that fits the current codebase
- the option with the best reuse of the existing streamer architecture

Do **not** plan around a pure GitHub Pages-only implementation if the goal is current-feature parity.
