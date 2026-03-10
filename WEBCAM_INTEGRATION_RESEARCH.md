# Webcam Integration Research Spike

## Goal

Explore how Brave Paws could show a live dog-camera feed inline with the session timers so the owner can monitor video and audio while running a separation-anxiety session. Also assess stretch goals around timestamping each training step and storing or referencing the matching video segments in Google Drive or a similar user-owned backend.

## Current Constraints in This Repository

- Brave Paws is a client-side React + TypeScript SPA with no back-end service.
- Session data currently lives in `localStorage`, with optional Google Drive / Google Sheets sync already implemented for structured session data.
- The active session view already has the core timer workflow, so the most natural UI extension is a split view: timers on one side, embedded video player on the other.
- Because there is no existing media pipeline, the first implementation should prefer sources that browsers can already play directly or embed safely.

## Evaluation Criteria

A good webcam solution for Brave Paws should ideally provide:

1. **Inline playback** inside the app, not just a separate tab.
2. **Video and audio** monitoring.
3. **Low enough latency** that the owner can react during live training.
4. **Simple setup** for non-technical users.
5. **Reasonable privacy** for in-home video.
6. **A future path to timestamped events and saved references** without requiring a large back-end project.

## Options Considered

### 1. Local-network IP stream (for example a Raspberry Pi camera)

#### What it would look like

The user provides a URL for a camera feed on the same local network, such as:

- MJPEG stream in an `<img>` or `<iframe>`
- HLS stream in a `<video>` element (possibly with `hls.js` on browsers that need it)
- WebRTC stream from a small Raspberry Pi helper service

#### Feasibility

**High for a research prototype, especially if the source is MJPEG or HLS.**

This is the most direct way to keep the feed inline in Brave Paws without depending on a public platform. A Raspberry Pi can run a lightweight camera stack and expose a browser-playable URL on the LAN.

#### Pros

- Best privacy story if the stream never leaves the home network.
- Fits the current app architecture because the app only needs a URL and a player container.
- Can offer low latency, especially with WebRTC.
- Easy to place beside the session timers in the active session layout.
- Works even if the user does not want a cloud service account.

#### Cons / Risks

- Browser compatibility depends on stream format:
  - **MJPEG** is easy but bandwidth-heavy and lower quality.
  - **HLS** is broadly workable but may add several seconds of latency.
  - **WebRTC** is ideal for latency but more complex to set up.
- CORS, authentication, and mixed-content issues can block playback.
  - Example: an `https`-hosted app cannot reliably embed a plain `http` camera feed.
- Consumer IP cameras often expose RTSP, which browsers cannot play directly. That usually requires a gateway that converts RTSP to HLS/WebRTC/MJPEG.
- Audio support varies by camera stack.

#### Recommendation

**Best primary path.**

If Brave Paws adds webcam support, the first serious implementation should target a **user-supplied embeddable camera URL**, with guidance for Raspberry Pi setups and a recommended format order:

1. **WebRTC** if the helper service is available
2. **HLS** if moderate latency is acceptable
3. **MJPEG** as the fallback, simplest-to-integrate option

A practical product choice would be to support a small set of provider types:

- `mjpeg`
- `hls`
- `iframe-embed`

That keeps the app flexible while avoiding an ambitious universal camera integration.

---

### 2. YouTube Live or another public / hosted livestream service

#### What it would look like

The user streams the dog camera to a service such as YouTube Live, Vimeo, Twitch, or another hosted platform, and Brave Paws embeds the provider's player inline using the service's iframe/player API.

#### Feasibility

**Medium.**

Embedding is usually straightforward if the provider allows it, but this option is weaker on privacy and latency.

#### Pros

- Fastest path for many users who already know how to create a livestream.
- Easy inline embedding with provider-supported iframe players.
- Audio and video playback are already handled by the provider.
- If the platform archives streams, there may already be a URL-based path to reference past footage.

#### Cons / Risks

- Privacy is much worse than a local feed, even with unlisted/private streams.
- Live latency can be too high for real-time monitoring, especially on YouTube Live.
- Platform restrictions may limit autoplay, embedding, mobile playback, or account requirements.
- The app becomes dependent on third-party uptime and policy changes.
- Public platforms are a poor match for sensitive in-home monitoring.

#### Recommendation

**Useful as a secondary compatibility mode, not the primary recommendation.**

This is acceptable for a proof of concept or for users who already have a streaming workflow, but it should be positioned as a convenience option rather than the default Brave Paws solution.

If implemented, prefer a generic **embed URL** approach with provider-specific help text instead of baking in deep platform logic too early.

---

### 3. Joining a Google Meet link inside the app

#### What it would look like

The owner starts or joins a Google Meet call where another device is sharing the dog's camera feed, and Brave Paws tries to render that call inline in the app.

#### Feasibility

**Low for true inline playback.**

This is the weakest option for the stated goal.

#### Why it is difficult

- Google Meet is not designed to be embedded as a third-party inline media player inside another app.
- Authentication with the same Google account used for Drive OAuth does **not** automatically grant Brave Paws the ability to embed or control Meet.
- Browser security policies, cross-origin restrictions, and Google product limitations make inline Meet playback unrealistic.
- Even if a link can be opened, it would most likely need to open in a separate Meet tab or window.

#### Practical fallback

A future version of Brave Paws could offer a **"Open camera feed"** helper button that launches a Meet link in a second window, but that does **not** satisfy the core requirement of a reliable inline feed next to the timers.

#### Recommendation

**Do not pursue Google Meet as the main implementation path.**

Treat it only as a manual workaround outside the app, not as a productized inline webcam feature.

---

## Comparison Summary

| Option | Inline in app | Audio | Latency | Privacy | Implementation effort | Overall fit |
|---|---|---:|---:|---:|---:|---|
| Local-network IP stream | Yes | Usually yes | Good to excellent | Best | Medium | **Best overall** |
| Hosted livestream embed | Yes | Yes | Medium to poor | Weak | Low to medium | Good fallback |
| Google Meet | Not reliably | Yes | Medium | Medium | High / blocked by platform limits | Poor |

## Recommended Product Direction

### Phase 1: Inline monitoring with user-supplied sources

Build webcam support around a **configurable video source** stored in app settings, then render it inline on the active session screen.

Suggested scope:

- Add a simple camera configuration model:
  - provider type
  - source URL / embed URL
  - optional label
  - whether audio should start muted
- Show the feed in `ActiveSession` beside or below the timers.
- Support only sources that browsers can safely render:
  - iframe embeds from approved providers
  - direct video/HLS URLs
  - MJPEG URLs
- Validate and normalize user-entered URLs before saving.

This delivers the core user value without introducing recording infrastructure yet.

### Phase 2: Session event timeline

To support later video correlation, Brave Paws should capture wall-clock timestamps during the live session.

Suggested data to record:

- session started at
- session ended at
- each step started at
- each step completed or skipped at
- manual pause / resume events if those matter for analysis

A lightweight future-friendly shape would be to store a list of events rather than only mutating the existing `Step.completed` flag. That would let Brave Paws map training events onto any external recording later.

### Phase 3: Recording references rather than recording files

For the stretch goal, the first version should store **references** to recordings, not try to generate or clip video files inside the browser.

Examples:

- a YouTube archive URL plus step start/end offsets
- a Drive file ID for a manually uploaded recording
- a Raspberry Pi/NVR recording URL plus time offsets

This fits the current architecture much better than trying to capture, transcode, and upload media directly from the app.

## Google Drive / Backend Stretch Goal Assessment

Brave Paws already has Google Drive and Google Sheets integration for session data, so Google Drive is the most natural place to store recording metadata.

### What is realistic soon

- Store a `videoSourceType`, `videoSourceLabel`, `recordingUrl`, `recordingFileId`, or `recordingStartTime` alongside a session.
- Sync those fields through the existing Google Sheets export/import flow.
- Let the user paste a Drive link or uploaded recording reference manually.

### What is harder

- Uploading large video files from the app reliably.
- Clipping precise snippets from remote streams in-browser.
- Recording arbitrary third-party embedded streams due CORS, DRM, autoplay, and browser media restrictions.
- Creating server-side highlight clips without introducing a real backend or using provider-specific APIs.

### Best stretch-goal approach

**Start with metadata pointers, not media processing.**

For example, each saved session could eventually include:

- `videoSourceType`
- `recordingUrl` or `driveFileId`
- `recordingStartedAt`
- `stepEvents[]` with ISO timestamps

That is enough to correlate the session timeline with an externally stored recording, even before Brave Paws can manage clips automatically.

## Security and Privacy Notes

Any webcam integration should explicitly handle:

- **URL validation:** only allow `https:` URLs in hosted deployments unless the app is knowingly running on local `http:`.
- **Provider allowlists:** iframe providers should be allowlisted to reduce injection risk.
- **Sandboxing:** embedded iframes should use the narrowest practical permissions.
- **Autoplay rules:** browsers often require muted autoplay, so audio may need an explicit unmute action.
- **Local secrets:** Brave Paws should not store camera passwords or long-lived stream credentials in `localStorage` unless there is a very clear consent model.
- **Household privacy:** in-home video is highly sensitive; the default recommendation should favor local-network or user-owned storage options.

## Proposed Implementation Order

1. **Prototype local/hosted inline player support in `ActiveSession`**
   - user-configured URL
   - one supported direct format and one iframe format
2. **Add step-event timestamps to session data**
   - enough to map timer events onto footage later
3. **Extend export / sync formats with optional video-reference metadata**
   - no recording pipeline yet
4. **Investigate a Raspberry Pi helper recipe**
   - ideally WebRTC first, HLS/MJPEG fallback
5. **Only then evaluate provider-specific archival features**
   - YouTube archives, Drive file references, or NVR exports

## Final Recommendation

If Brave Paws wants a practical inline dog-monitoring feature, it should **not** start with Google Meet. The strongest path is:

1. **Primary:** local-network IP camera support, especially Raspberry Pi-friendly browser-playable streams
2. **Secondary:** hosted/embed livestream support for users who already have that workflow
3. **Avoid as a core solution:** Google Meet, because it is poorly suited to embedded inline monitoring

For the stretch goals, Brave Paws should first add **timestamped session events plus recording references**. That creates a solid foundation for later Drive-backed or provider-backed recording workflows without forcing the app to solve video recording and clipping in the first iteration.
