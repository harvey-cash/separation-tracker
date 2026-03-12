# Release Guide

This repository now produces two kinds of distributable output:

1. The Brave Paws web app build in `dist/`
2. The Brave Paws Streamer portable bundle in `dist/brave-paws-streamer.zip`

## For Non-Technical Windows Streamer Users

If you only need the Windows streamer, use the portable zip:

- [dist/brave-paws-streamer.zip](dist/brave-paws-streamer.zip)

That zip contains the streamer files plus the single executable launcher. After extracting it on the Windows laptop:

1. Open the extracted `brave-paws-streamer` folder.
2. Double-click `start-camera-gui.bat`.

Brave Paws Streamer opens a local browser UI, lets you start the camera stream, and shows a QR code that Brave Paws can scan directly. The portable zip includes `BravePawsStreamer.exe`, so end users do not need Node.js installed separately.

## Local Release Commands

From the repo root:

1. `npm run camera-helper:health`
   Validates the Windows helper API end to end.
2. `npm run camera-helper:bundle`
   Builds the portable helper folder and zip in `dist/`.
3. `npm run build`
   Builds the main Brave Paws web app.

## CI And CD

- Pull requests run automated app checks on Ubuntu and helper health checks on Windows.
- Commits on `main` build and upload the portable helper artifact from GitHub Actions.

If you need the latest packaged helper from CI rather than a local build, download the artifact from the latest successful `CD` workflow run on `main`.