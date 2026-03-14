# Release Guide

This repository now produces three kinds of distributable output:

1. The Brave Paws landing page build in `apps/brave-paws-landing/dist/`
2. The Brave Paws web app build in `apps/brave-paws-app/dist/`
3. The Brave Paws Streamer portable bundle in `apps/brave-paws-streamer/dist/brave-paws-streamer.zip`

These are now released separately on GitHub so users can download only what they need.

## For Non-Technical Windows Streamer Users

If you only need the Windows streamer, use the portable zip:

- [apps/brave-paws-streamer/dist/brave-paws-streamer.zip](apps/brave-paws-streamer/dist/brave-paws-streamer.zip)

That zip contains the streamer files with `BravePawsStreamer.exe` as the single entry point. After extracting it on the Windows laptop:

1. Open the extracted folder.
2. Double-click `BravePawsStreamer.exe`.

Brave Paws Streamer opens a local browser UI, lets you start the camera stream, and shows a QR code that Brave Paws can scan directly. On first launch it downloads `go2rtc`, `cloudflared`, and `ffmpeg` automatically if they are not already available, so end users do not need Node.js or manual helper setup.

The portable helper now launches the hosted control page at `https://harvey.cash/separation/streamer/`, which connects back to the loopback API on the Windows machine.

### Automated Streamer GitHub Releases

- Commits merged to `main` now create a dedicated GitHub release for Brave Paws Streamer through `.github/workflows/streamer-release.yml`.
- Each streamer release publishes only `brave-paws-streamer.zip` and does not bundle the web app.
- Streamer tags use the format `streamer-v<root-version>-<short-sha>` unless you override the tag in a manual dispatch.
- Streamer releases are marked with `make_latest: false` so they do not replace the web app's repo-wide latest release badge.

For a public download link, use the release asset URL pattern:

- `https://github.com/<owner>/<repo>/releases/download/<streamer-tag>/brave-paws-streamer.zip`

Example:

- `https://github.com/harvey-cash/separation-tracker/releases/download/streamer-v0.1.17-abc1234/brave-paws-streamer.zip`

## Local Release Commands

From the repo root:

1. `npm run camera-helper:health`
   Validates the Windows helper API end to end.
2. `npm run camera-helper:bundle`
   Builds the portable helper folder and zip in `apps/brave-paws-streamer/dist/`.
3. `npm run build`
   Builds the landing page and the main Brave Paws web app.

## Hosted Web Targets

- Brave Paws landing page deploys to `https://harvey.cash/separation/`
- Brave Paws App deploys to `https://harvey.cash/separation/app/`
- Brave Paws Streamer UI deploys to `https://harvey.cash/separation/streamer/`

## CI And CD

- Pull requests run automated app checks on Ubuntu and helper health checks on Windows.
- Commits on `main` continue to create the Brave Paws App release and deployment pipeline through `.github/workflows/cd.yml`.
- Commits on `main` now also create a separate Brave Paws Streamer GitHub release through `.github/workflows/streamer-release.yml`.

If you need the latest packaged helper from CI rather than a local build, use the latest `Streamer Release` GitHub release asset rather than a temporary Actions artifact.
