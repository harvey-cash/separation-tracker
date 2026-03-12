# Brave Paws Streamer

This folder contains a fully automated setup to stream your Windows laptop webcam and microphone to the Brave Paws app completely securely, even when you are away from your home WiFi.

## Streamer App

Use `start-camera-gui.bat` to launch Brave Paws Streamer with a large live preview and a scannable Brave Paws pairing QR code.

Brave Paws Streamer:
1. Opens a local browser app on your Windows laptop.
2. Uses `go2rtc` and `cloudflared` to publish a secure stream from your Windows laptop.
3. Lets you pick a camera and microphone, start the stream, view a large live preview, and pair Brave Paws by scanning a QR code.
4. Renders the QR code locally on the laptop, so the streamer UI does not depend on any external QR image service.
5. Keeps the original `start-camera.bat` script available if you prefer the terminal-based launcher.

Note: during local development the streamer runs from the repo root with `node windows-camera-helper-ui/server.cjs` or `npm run camera-helper:gui`. The packaged bundle includes `BravePawsStreamer.exe`, so end users do not need Node.js installed separately.

## Packaging And Validation

From the repo root, you can now run:
1. `npm run camera-helper:health` to boot the streamer, start a real tunnel with the first detected devices, verify the QR payload, and stop everything again.
2. `npm run camera-helper:bundle` to build `dist/brave-paws-streamer` and a matching zip containing the single executable launcher plus sidecar files.

The portable bundle removes the need for both a repo checkout and a separate Node.js install on the target laptop.

## How it Works
When you double click `start-camera.bat`, the helper script will:
1. Automatically download `go2rtc` (a lightweight camera streaming server) and `cloudflared` (Cloudflare Tunnels) if they are missing.
2. Scan your laptop for available cameras and microphones using `ffmpeg`, and prompt you to select which ones to use.
3. Transcode the camera feed on-the-fly to H.264 / AAC so it is perfectly compatible with the remote tunnel using MSE (Media Source Extensions).
4. Securely expose the video feed to the public internet temporarily.
5. Give you a `https://<random>.trycloudflare.com` URL to use with the Brave Paws app.

When you press `CTRL+C` or close the black terminal window, both applications are securely killed and your tunnel collapses, ensuring absolute privacy when you return home.

## Prerequisites
1. **Windows 10 or 11**.
2. **FFmpeg**. Due to how Windows handles webcams, you need `ffmpeg.exe` installed or placed in this folder.
   * If you don't have it, download the `ffmpeg-master-latest-win64-gpl.zip` from [Gyan.dev](https://github.com/BtbN/FFmpeg-Builds/releases) and extract just the `ffmpeg.exe` file into this directory.

## Instructions
### Streamer App
1. Open your laptop and point it toward where your dog usually rests.
2. Double-click **`start-camera-gui.bat`**.
3. Wait for Brave Paws Streamer to open in your browser, then confirm the detected camera and microphone.
4. Click **Start Camera** and wait for the pairing QR code to appear.
5. In Brave Paws on your phone, scan the QR code to save the stream automatically.
6. Keep the streamer page open while you are away. Click **Stop** or close it when you return.

### Legacy Script
1. Open your laptop and point it toward where your dog usually rests.
2. Double-click the **`start-camera.bat`** file.
3. Follow the on-screen prompts to select your camera and microphone by typing their corresponding number and pressing `Enter`.
4. Wait a few seconds for the script to negotiate the secure tunnel and generate your URL.
5. Open **Brave Paws** on your phone using mobile data.
6. In your active session or session setup, tap the remote stream link field and paste the secure `.trycloudflare.com` URL.

## Note on Privacy
These streams are routed through encrypted temporary tunnels. **No video data is saved by Brave Paws Streamer.** The secure stream URL changes every time you launch it.