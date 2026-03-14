# Brave Paws Streamer Static-Hosting Feasibility Spike

## Executive Summary

The first spike concluded that **Approach B is the right near-term direction**:

> host the streamer UI at `harvey.cash/separation/streamer`, but keep a trusted local helper to handle device access, process management, and secure tunnel creation.

That remains the best fit for the current repo because the Windows streamer already separates into:

- a **thin browser UI** in `windows-camera-helper-ui/public/app.js`
- a **local control plane** in `windows-camera-helper-ui/server.cjs`
- a **portable package entry point** in `windows-camera-helper-ui/package-portable.mjs`
- a **runtime dependency manifest** in `windows-camera-helper-ui/streamer-assets.cjs`

The second spike asked a different question: if the static UI plus localhost helper model is adopted now, **how should the helper be designed so future helpers can exist for Windows, macOS, Linux, Raspberry Pi, Android, and iOS without rethinking the whole product again?**

Short answer:

- **yes**, the static UI + native helper model can be made much more OS agnostic
- the right split is a **shared hosted web UI plus a small platform-specific capture/orchestration adapter**
- desktop/server-class platforms are realistic fits for the localhost-helper model
- Android and iOS are only partial fits; they likely need **native wrapper apps or fully native apps**, not a generic localhost process
- the hosted-UI approach is still the best balance of reach, reuse, and iteration speed

## Current Architecture Snapshot

Today the checked-in streamer is fundamentally a **local helper with an embedded local web UI**:

- `server.cjs` currently exposes `/api/bootstrap`, `/api/status`, `/api/refresh-devices`, `/api/start`, and `/api/stop`
- it downloads or resolves `go2rtc`, `cloudflared`, and `ffmpeg`
- it enumerates Windows DirectShow devices, writes `go2rtc.yaml`, launches the processes, and generates the QR code payload
- `public/app.js` polls those endpoints and renders controls, logs, preview, and QR state

That means the current codebase is already close to the desired split:

1. **hosted UI**
2. **local native/helper runtime**

The work is not inventing a new product shape. The work is **decoupling the current Windows helper from its bundled static assets and turning the helper boundary into a stable cross-platform contract**.

## Concise Summary Of The First Spike

The first spike evaluated four broad options.

| Option | Verdict | Concise reason |
|---|---|---|
| A. Pure static page with browser-only capture | Discarded for near-term delivery | A static page cannot supervise `go2rtc`, `cloudflared`, device discovery, or reliable always-on streaming without introducing a much larger hosted media architecture. |
| B. Static page + localhost native helper | **Chosen direction** | Best match to the current codebase and user flow; preserves the tunnel-based pairing model with the least redesign. |
| C. Static page + browser extension + native messaging | Discarded | Technically possible, but install friction, browser-specific review/policy burden, and poorer UX make it worse than a helper app. |
| D. Static page + managed relay/signaling service | Deferred as future-state architecture | Could be cleaner long-term, but it is no longer a small follow-up to the current repo and requires backend/infrastructure investment. |

The first spike therefore answered:

- **Can the streamer become pure static hosting with no native component?** No, not while keeping the current behavior.
- **Can the UI be statically hosted while preserving roughly the current experience?** Yes, if a trusted local helper remains responsible for capture, orchestration, and tunneling.

## What Must Stay Local Even With Static Hosting

If `harvey.cash/separation/streamer` becomes the main entry point, the hosted page can own presentation and onboarding, but the helper still needs to own:

- device enumeration
- capture pipeline setup
- local dependency resolution or bundling
- `go2rtc` lifecycle
- `cloudflared` lifecycle
- secure stream URL generation
- QR payload generation
- health/state reporting back to the hosted page

That is true on every platform. The main design question is therefore not whether a helper exists, but **how much of the helper can be shared and how much must remain platform-specific**.

## New Research: Designing The Native Helper To Be OS Agnostic

### Goal

The eventual product goal is:

> anyone visiting `harvey.cash/separation/streamer` should be guided to the correct streamer installation for their environment and, after installation, use a familiar hosted control UI regardless of platform.

That implies the hosted page should become the stable front door, while helper implementations vary by platform behind a common contract.

### Recommended Architectural Split

The helper should be redesigned around three layers:

#### 1. Shared hosted UI

Owned centrally at `harvey.cash/separation/streamer`.

Responsibilities:

- installation/startup instructions
- helper detection
- device selection UI
- start/stop controls
- logs, preview, and QR presentation
- upgrade messaging and troubleshooting help

This layer should be as platform-neutral as possible.

#### 2. Shared helper protocol

This is the most important OS-agnostic investment.

Define a stable future loopback API and event model that every helper implementation follows, for example:

- `GET /api/bootstrap`
- `GET /api/status`
- `POST /api/start`
- `POST /api/stop`
- `POST /api/refresh-devices`
- optional WebSocket or SSE stream for logs/status changes

Shared payload concepts should include:

- platform name and version
- helper version
- install/update status of dependencies
- available audio/video devices
- active stream state
- preview URL if applicable
- public pairing URL / QR payload
- machine-readable error codes

If this contract is kept stable, the hosted UI can remain largely unchanged while helpers evolve per platform.

#### 3. Platform-specific helper adapters

These are the pieces that should differ per OS:

- device enumeration
- process spawning and shutdown
- dependency packaging or download locations
- installer/distribution method
- auto-start and permissions behavior
- mobile-specific camera/session APIs where localhost helpers are not practical

In other words:

- **share the API shape and user flow**
- **specialize the OS integration**

### What Is Realistically Shareable Across Platforms

The following logic is good shared-helper territory, even if the final binaries differ:

- state machine for idle / starting / running / stopping / error
- hosted-page authentication/token validation
- QR payload generation
- stream URL normalization
- config templating for `go2rtc`
- tunnel URL parsing and validation
- structured logging/event emission
- version reporting and update checks

The following logic is inherently platform-specific:

- camera/microphone enumeration
- process kill semantics
- executable naming and path resolution
- sandbox/permission prompts
- installer format and update channel
- whether the platform even permits a localhost daemon

That split suggests a practical rule:

> keep the product contract shared, but allow the capture/runtime adapter to be platform-native.

### Platform-by-Platform Evaluation

#### Windows

Windows is already the reference implementation.

Fit with hosted UI + localhost helper:

- **excellent**

Why:

- current code already works this way
- `.exe` packaging is familiar
- loopback helper and spawned binaries are normal on desktop Windows

Recommended direction:

- refactor the existing helper into a headless local API plus hosted UI
- keep Windows as the first-class baseline contract for other helper ports

#### macOS

Fit with hosted UI + localhost helper:

- **strong**

Why:

- desktop app plus loopback service is viable
- camera/microphone permissions can be requested through a native app
- `cloudflared` and `go2rtc` both have macOS distributions

Main complications:

- code signing and notarization matter much more than on Windows
- camera enumeration and capture plumbing are different

Recommended direction:

- build a native macOS helper app or packaged desktop helper that exposes the same local API as Windows

#### Linux

Fit with hosted UI + localhost helper:

- **strong**, especially for technical users

Why:

- loopback services and sidecar binaries are normal
- Linux packaging can target AppImage, `.deb`, Snap, or Flatpak depending on audience
- `cloudflared`, `go2rtc`, and `ffmpeg` all fit naturally here

Main complications:

- camera/audio stack differences across distros
- broader support matrix than Windows/macOS

Recommended direction:

- treat Linux as a supported helper family, not a single packaging target
- standardize the loopback API first, then ship the simplest install path that matches the intended audience

#### Raspberry Pi

Fit with hosted UI + localhost helper:

- **very strong**

Why:

- Raspberry Pi is effectively a Linux appliance target
- always-on local helper is a natural fit
- the hosted UI is useful because it avoids requiring the Pi itself to own the full control UI lifecycle

Main complications:

- ARM build/distribution
- lower resource ceilings
- potentially headless operation

Recommended direction:

- treat Raspberry Pi as a Linux helper profile with ARM packaging and optional service-mode startup

#### Android

Fit with hosted UI + localhost helper:

- **partial only**

Why:

- Android can run native apps and local HTTP servers, but this is a much less natural product shape than desktop
- background execution, camera access, and localhost communication are governed by mobile OS lifecycle rules
- distribution would almost certainly need to be a real Android app, not “download a generic helper process”

Most realistic shapes:

1. **native Android app that embeds or loads the hosted UI**
2. native Android app with its own UI but same conceptual helper contract
3. browser-only capture flow, which would be a different product with weaker parity

Recommendation:

- do not assume Android will use the same localhost-helper packaging pattern as desktop
- instead, aim for a **shared hosted UI concept and shared API contract**, with an Android-native wrapper/bridge when mobile becomes a priority

#### iOS

Fit with hosted UI + localhost helper:

- **weak**

Why:

- iOS is the least compatible platform with the desktop localhost-helper model
- long-running local daemons, arbitrary sidecar binaries, and general-purpose localhost helper installation are not natural app-store patterns
- camera/microphone access, background behavior, and networking are tightly constrained

Most realistic shapes:

1. **fully native iOS app**
2. native shell that embeds web content and bridges selected operations to native code

Recommendation:

- plan for iOS as a **native app target**, even if it reuses hosted UI assets or shared product flows
- do not design the desktop helper API under the assumption that iOS can run the same implementation style

### Packaging And Install Discovery Implications

If the hosted page becomes the universal front door, it should not try to pretend every platform installs the same artifact.

Instead, `harvey.cash/separation/streamer` should detect environment and present the best available path, for example:

- **Windows:** download `.exe`
- **macOS:** download signed app or installer
- **Linux:** show supported distro/install methods
- **Raspberry Pi:** show ARM build/service setup path
- **Android:** send to Play Store or APK distribution page when ready
- **iOS:** send to App Store/TestFlight when ready

Important nuance:

- environment detection should guide defaults, not hard-block alternatives
- the page should still expose manual platform choices
- the page should also detect whether a local helper is already running and switch from “install” to “connect”

That leads to the right product framing:

> one hosted destination, multiple platform-specific helper distributions, one mostly consistent control experience after connection.

### Localhost Communication Constraints

For desktop/server-class platforms, the hosted page talking to loopback is still the most practical design.

However, the trust boundary must be explicit.

Minimum requirements before shipping:

- bind only to `127.0.0.1` or equivalent loopback
- validate `Origin` against the hosted streamer domain
- require a per-launch token or pairing secret
- avoid unauthenticated start/stop endpoints
- avoid assuming that possession of localhost access alone is enough authorization

Helpful future-proofing additions:

- a helper “pair with this page” handshake
- WebSocket/SSE logs instead of aggressive polling
- helper version negotiation so the hosted page can support older helpers gracefully

Those protections matter on every desktop platform, not just Windows.

### Recommended OS-Agnostic Strategy

The best future-proof plan is:

1. **standardize the helper protocol first**
2. **keep the hosted UI as the canonical control surface**
3. **treat Windows/macOS/Linux/Raspberry Pi as localhost-helper platforms**
4. **treat Android/iOS as native-app or native-wrapper platforms**
5. **reuse product flow and API concepts even where the runtime implementation differs**

That gives Brave Paws Streamer a coherent multi-platform story without waiting for every platform to converge on identical technical internals.

## Should Brave Paws Streamer Become Fully Native Instead?

This spike also evaluated the alternative of **not** hosting the UI statically at all, and instead building native streamer apps as the primary experience.

### Pros Of Going Fully Native

- strongest alignment with mobile operating systems, especially iOS
- better access to camera, microphone, permissions, background execution, and OS-level UX affordances
- no public-page-to-localhost trust boundary to harden
- app-store distribution can be more natural on mobile
- each platform can feel more polished and idiomatic

### Cons Of Going Fully Native

- much higher engineering and maintenance cost across platforms
- slower iteration than changing a centrally hosted web UI
- harder to keep Windows/macOS/Linux/mobile features visually and behaviorally aligned
- more review/signing/release-process overhead
- lower reuse of the current browser client already present in `public/app.js`
- weaker “visit one URL and get started” story

### Practical Comparison: Hosted UI + Helper vs Fully Native

| Question | Hosted UI + helper | Fully native apps |
|---|---|---|
| Best fit for current Windows codebase | **Excellent** | Moderate |
| Centralized UI updates | **Excellent** | Weak |
| Desktop parity with current flow | **Excellent** | Strong |
| Mobile fit | Partial | **Strongest** |
| Engineering cost | **Lower** | Higher |
| Distribution simplicity across many environments | Strong if install-dispatch is well designed | Weaker because every platform needs its own app lifecycle |
| Long-term architectural purity | Good | Good, but at much higher cost |

### Verdict On The Native-App Alternative

Fully native streamer apps are worth considering if:

- mobile capture becomes a first-class product requirement
- app-store distribution becomes strategically important
- Brave Paws is willing to fund multiple platform-specific app lifecycles

But for the current repo and the stated objective of sending users to `harvey.cash/separation/streamer`, **fully native should not replace the hosted-UI plan as the primary near-term direction**.

The better framing is:

- use **hosted UI + local helper** as the main cross-platform desktop/server strategy
- allow **native wrappers or fully native apps** where platform constraints make localhost-helper patterns awkward, especially on Android and iOS

## Final Recommendation

Continue pursuing **Approach B** and reshape it into:

> **one hosted streamer UI, one shared helper protocol, multiple platform-specific helper implementations**

Near-term:

- refactor the current Windows helper into a headless API plus hosted UI
- harden localhost trust boundaries
- design the helper API as a durable cross-platform contract

Medium-term:

- extend the helper pattern to macOS, Linux, and Raspberry Pi
- use the hosted page as the install-dispatch and control surface for those platforms

Long-term:

- treat Android and iOS as native-wrapper or native-app targets that reuse the same product model where possible

That path best satisfies the eventual goal that **anyone visiting `harvey.cash/separation/streamer` can be directed toward the right installation for their environment while preserving a mostly consistent Brave Paws Streamer experience.**
