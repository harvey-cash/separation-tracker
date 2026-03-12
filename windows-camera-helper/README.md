# Brave Paws Windows Camera Helper

This folder contains a fully automated setup to stream your Windows laptop webcam and microphone to the Brave Paws app completely securely, even when you are away from your home WiFi.

## New GUI Helper

If you want a cleaner workflow with a large live preview and scannable QR code, use `start-camera-gui.bat`.

The GUI helper:
1. Opens a local browser app on your Windows laptop.
2. Keeps the same `go2rtc` and `cloudflared` backend workflow as the original helper.
3. Lets you pick a camera and microphone, start the tunnel, view a large live preview, and scan the Cloudflare URL from Brave Paws.
4. Renders the QR code locally on the laptop, so the helper UI itself does not depend on an external QR image service.
5. Keeps the original `start-camera.bat` script available as the legacy fallback.

Note: during local development the GUI helper runs from the repo root with `node windows-camera-helper-ui/server.cjs` or `npm run camera-helper:gui`. The packaged helper zip includes `BravePawsCameraHelper.exe`, so end users do not need Node.js installed separately.

## Packaging And Validation

From the repo root, you can now run:
1. `npm run camera-helper:health` to boot the GUI helper, start a real tunnel with the first detected devices, verify the QR payload, and stop everything again.
2. `npm run camera-helper:bundle` to build `dist/brave-paws-camera-helper` and a matching zip containing the single executable launcher plus helper sidecar files.

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
### GUI Helper
1. Open your laptop and point it toward where your dog usually rests.
2. Double-click **`start-camera-gui.bat`**.
3. Wait for the browser helper to open, then confirm the detected camera and microphone.
4. Click **Start Camera** and wait for the secure tunnel and QR code to appear.
5. On your phone, open Brave Paws and use the new **Scan QR Code** flow, or open the Cloudflare link once in your browser and tap **I Agree** if prompted.
6. Keep the helper page open while you are away. Click **Stop** or close the helper when you return.

### Legacy Script
1. Open your laptop and point it toward where your dog usually rests.
2. Double-click the **`start-camera.bat`** file.
3. Follow the on-screen prompts to select your camera and microphone by typing their corresponding number and pressing `Enter`.
4. Wait a few seconds for the script to negotiate the secure tunnel and generate your URL.
5. **IMPORTANT (Cloudflare Protection):** Open your phone's internet browser, navigate to the generated link, and click **"I Agree"** on the anti-phishing warning page.
6. Open **Brave Paws** on your phone using mobile data.
7. In your active session or session setup, tap 'Link Camera' and paste the secure `.trycloudflare.com` URL.

## Note on Privacy
These streams are entirely routed through securely encrypted Cloudflare edge nodes using temporary tunnels. **No video data is ever saved to a server.** To guarantee security, the secure tunnel URL changes every time you launch the `.bat` file!