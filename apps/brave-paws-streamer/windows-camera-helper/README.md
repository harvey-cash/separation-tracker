# Brave Paws Streamer

This folder contains a fully automated setup to stream your Windows laptop webcam and microphone to the Brave Paws app completely securely, even when you are away from your home WiFi.

## Streamer App

Use `BravePawsStreamer.exe` from the packaged Windows bundle to launch Brave Paws Streamer with a large live preview and a scannable Brave Paws pairing QR code.

Brave Paws Streamer:
1. Opens the hosted control page at `https://harvey.cash/separation/streamer/` on your Windows laptop.
2. Uses `go2rtc` and `cloudflared` to publish a secure stream from your Windows laptop.
3. Lets you pick a camera and microphone, start the stream, view a large live preview, and pair Brave Paws by scanning a QR code.
4. Renders the QR code locally on the laptop, so the streamer UI does not depend on any external QR image service.
5. Automatically downloads `go2rtc`, `cloudflared`, and `ffmpeg` into the helper folder on first launch if they are missing.

The laptop preview and the paired Brave Paws preview are intentionally tuned differently. The laptop preview stays quality-oriented, while the paired Brave Paws stream can request a separate remote-first playback profile intended to reduce effective latency and recover more cleanly from stalls on the public tunnel path. The low-latency remote profile now lowers resolution, bitrate, and audio bandwidth to improve recovery, while the resilient profile keeps a slightly heavier stream when stability matters more than minimum delay.

Note: during local development the streamer runs from the `apps/brave-paws-streamer/` workspace with `node windows-camera-helper-ui/server.cjs` or, from the repo root, `npm run camera-helper:gui`. The packaged bundle includes `BravePawsStreamer.exe`, so end users do not need Node.js installed separately.

## Packaging And Validation

From the repo root, you can run:
1. `npm run camera-helper:health` to boot the streamer, start a real tunnel with the first detected devices, verify the QR payload, and stop everything again.
2. `npm run camera-helper:bundle` to build `apps/brave-paws-streamer/dist/brave-paws-streamer` and a matching zip containing the single executable entry point.

The portable bundle removes the need for both a repo checkout and a separate Node.js install on the target laptop.

## How it Works
When you double click `BravePawsStreamer.exe`, the app will:
1. Automatically download `go2rtc` (a lightweight camera streaming server), `cloudflared` (Cloudflare Tunnels), and `ffmpeg` if they are missing.
2. Scan your laptop for available cameras and microphones using `ffmpeg`, and prompt you to select which ones to use.
3. Transcode the camera feed on-the-fly to H.264 / AAC so it is compatible with the tunnel-compatible remote playback path while still supporting a high-quality local preview.
4. Securely expose the video feed to the public internet temporarily.
5. Open the hosted streamer page automatically and give you a `https://<random>.trycloudflare.com` URL plus a pairing QR code for the Brave Paws app.

When you close Brave Paws Streamer, both applications are securely killed and your tunnel collapses, ensuring absolute privacy when you return home.

## Prerequisites
1. **Windows 10 or 11**.

## Instructions
1. Open your laptop and point it toward where your dog usually rests.
2. Double-click **`BravePawsStreamer.exe`**.
3. Wait for the hosted Brave Paws Streamer page to open in your browser, then confirm the detected camera and microphone.
4. Click **Start Camera** and wait for the pairing QR code to appear.
5. In Brave Paws on your phone, scan the QR code to save the stream automatically.
6. Keep the streamer page open while you are away. Click **Stop** or close it when you return.

## Note on Privacy
These streams are routed through encrypted temporary tunnels. **No video data is saved by Brave Paws Streamer.** The secure stream URL changes every time you launch it.
