# Brave Paws Streamer

Brave Paws Streamer is the Windows companion app that publishes a secure live camera stream and QR pairing link for Brave Paws App.

The deployable streamer UI now targets `https://harvey.cash/separation/streamer/`, while the Windows helper exposes a localhost loopback API that the hosted page connects to with an origin check and per-launch session token.

This workspace owns the loopback API, the Windows-specific adapter, packaging logic, health checks, hosted UI assets, runtime helper files, and streamer-specific tests.

The current implementation now distinguishes between two playback surfaces:
- Local laptop preview stays on a quality-oriented profile.
- Remote Brave Paws playback is paired with a remote-first profile that can request a different go2rtc mode order.

That split is intentional. Under the current router-free and backend-free deployment model, the public path remains tunnel-compatible HTTP playback, so the local laptop preview is no longer treated as a proxy for remote latency.

## Transport Evaluation

Swapping the current embedded go2rtc viewer `iframe` for a custom "native" player is not, by itself, a meaningful performance win.

- The `iframe` is just the container. If it loads go2rtc's built-in viewer, the browser still uses the same underlying media stack it would use for a custom page.
- The larger constraint in the current architecture is the transport path: camera capture → go2rtc → local HTTP server → cloudflared tunnel → remote browser.
- Because the public route is intentionally tunnel-compatible HTTP playback today, replacing the `iframe` alone does not remove the tunnel hop, the HTTP delivery mode, or the current buffering/recovery trade-offs.

A direct RTC-aware player only becomes materially interesting if the surrounding architecture also changes to support a true end-to-end WebRTC path, including compatible signaling and ICE traversal that can preserve the low-latency transport instead of falling back to the current tunnel-friendly HTTP modes.

In other words: a player rewrite may improve UI control and customization, but the main performance gains would come from changing the network transport and stream profiles, not from removing the `iframe` wrapper itself.

## Key Commands

From this directory:

| Command | Description |
|---|---|
| `npm run gui` | Start the Windows helper loopback API and open the hosted streamer UI. |
| `npm run health` | Run the streamer health check. |
| `npm run bundle` | Build the portable Windows bundle into `dist/`. |
| `npm test` | Run streamer unit tests. |

From the repo root, the equivalent delegated commands are `npm run camera-helper:gui`, `npm run camera-helper:health`, `npm run camera-helper:bundle`, and `npm run streamer:test`.

## Structure

```text
apps/brave-paws-streamer/
├── package.json
├── LOOPBACK_API.md
├── tests/
├── dist/
├── windows-camera-helper/
│   ├── README.md
│   └── go2rtc.yaml
└── windows-camera-helper-ui/
    ├── loopback-contract.cjs
    ├── health-check.mjs
    ├── package-portable.mjs
    ├── server.cjs
    ├── windows-adapter.cjs
    ├── public/
    └── streamer-assets.cjs
```

## Notes

- The portable bundle still emits `BravePawsStreamer.exe` and `brave-paws-streamer.zip`.
- The hosted UI should be deployed to `https://harvey.cash/separation/streamer/`.
- CI should run streamer health and bundle steps on Windows.
- The packager still uses `node_modules/pkg/lib-es5/bin.js` to avoid Windows `npx` issues.
- Pairing QR codes now carry remote playback profile metadata so the Brave Paws app can preserve remote playback intent instead of assuming a single fixed viewer mode.

## Related Docs

- End-user and runtime details: [windows-camera-helper/README.md](windows-camera-helper/README.md)
- Loopback protocol contract: [LOOPBACK_API.md](LOOPBACK_API.md)
- Repo overview and workspace commands: [../../README.md](../../README.md)
- Release process: [../../RELEASE.md](../../RELEASE.md)
