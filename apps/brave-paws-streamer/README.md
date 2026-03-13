# Brave Paws Streamer

Brave Paws Streamer is the Windows companion app that publishes a secure live camera stream and QR pairing link for Brave Paws App.

This workspace owns the streamer server, packaging logic, health checks, UI assets, runtime helper files, and streamer-specific tests.

## Key Commands

From this directory:

| Command | Description |
|---|---|
| `npm run gui` | Start the local streamer UI and API server. |
| `npm run health` | Run the streamer health check. |
| `npm run bundle` | Build the portable Windows bundle into `dist/`. |
| `npm test` | Run streamer unit tests. |

From the repo root, the equivalent delegated commands are `npm run camera-helper:gui`, `npm run camera-helper:health`, `npm run camera-helper:bundle`, and `npm run streamer:test`.

## Structure

```text
apps/brave-paws-streamer/
├── package.json
├── tests/
├── dist/
├── windows-camera-helper/
│   ├── README.md
│   └── go2rtc.yaml
└── windows-camera-helper-ui/
    ├── public/
    ├── health-check.mjs
    ├── package-portable.mjs
    ├── server.cjs
    └── streamer-assets.cjs
```

## Notes

- The portable bundle still emits `BravePawsStreamer.exe` and `brave-paws-streamer.zip`.
- CI should run streamer health and bundle steps on Windows.
- The packager still uses `node_modules/pkg/lib-es5/bin.js` to avoid Windows `npx` issues.

## Related Docs

- End-user and runtime details: [windows-camera-helper/README.md](windows-camera-helper/README.md)
- Repo overview and workspace commands: [../../README.md](../../README.md)
- Release process: [../../RELEASE.md](../../RELEASE.md)