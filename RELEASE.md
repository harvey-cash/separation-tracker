# Release Guide

This repository now produces two kinds of distributable output:

1. The Brave Paws web app build in `dist/`
2. The Windows camera helper portable bundle in `dist/brave-paws-camera-helper.zip`

## For Non-Technical Windows Helper Users

If you only need the Windows camera helper, use the portable zip:

- [dist/brave-paws-camera-helper.zip](dist/brave-paws-camera-helper.zip)

That zip contains the helper-only files plus the single executable launcher. After extracting it on the Windows laptop:

1. Open the extracted `windows-camera-helper` folder.
2. Double-click `start-camera-gui.bat`.

The helper opens a local browser UI, lets you start the camera stream, and shows a QR code that Brave Paws can scan directly. The portable zip includes `BravePawsCameraHelper.exe`, so end users do not need Node.js installed separately.

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