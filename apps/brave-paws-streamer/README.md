# Brave Paws Streamer

Brave Paws Streamer is the Windows companion app that publishes a secure live camera stream and QR pairing link for Brave Paws App.

The deployable streamer UI now targets `https://harvey.cash/separation/streamer/`, while the Windows helper exposes a localhost loopback API that the hosted page connects to with an origin check and per-launch session token.

This workspace owns the loopback API, the Windows-specific adapter, packaging logic, health checks, hosted UI assets, runtime helper files, and streamer-specific tests.

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

## Related Docs

- End-user and runtime details: [windows-camera-helper/README.md](windows-camera-helper/README.md)
- Loopback protocol contract: [LOOPBACK_API.md](LOOPBACK_API.md)
- Static-hosting research spike: [STATIC_HOSTING_FEASIBILITY.md](STATIC_HOSTING_FEASIBILITY.md)
- Repo overview and workspace commands: [../../README.md](../../README.md)
- Release process: [../../RELEASE.md](../../RELEASE.md)
