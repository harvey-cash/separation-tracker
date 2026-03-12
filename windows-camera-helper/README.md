# Brave Paws Windows Camera Helper

This folder contains a fully automated setup to stream your Windows laptop webcam to the Brave Paws app completely securely, even when you are away from your home WiFi.

## How it Works
When you double click `start-camera.bat`, the helper script will:
1. Automatically download `go2rtc` (a lightweight WebRTC server) to access your webcam with sub-second latency.
2. Automatically download `cloudflared` (Cloudflare Tunnels) to securely expose the video feed to the public internet temporarily.
3. Automatically configure them and glue them together.
4. Give you a `https://<random>.trycloudflare.com` URL to paste into the Brave Paws app on your phone.

When you close the black terminal window, both applications are securely killed and your tunnel collapses, ensuring absolute privacy.

## Prerequisites
1. **Windows 10 or 11**.
2. **FFmpeg**. Due to how Windows handles webcams, you need `ffmpeg.exe` installed or placed in this folder.
   * If you don't have it, download the `ffmpeg-master-latest-win64-gpl.zip` from [Gyan.dev](https://github.com/BtbN/FFmpeg-Builds/releases) and extract just the `ffmpeg.exe` file into this directory.

## Instructions
1. Open your laptop and point it where your dog usually rests.
2. Double-click the **`start-camera.bat`** file.
3. Wait 10-15 seconds for the script to download the prerequisites (first time only) and negotiate the secure tunnel.
4. Open **Brave Paws** on your phone using mobile data.
5. In your active session or session setup, paste the secure `.trycloudflare.com` URL.

## Note on Privacy
These streams are strictly peer-to-peer or routed entirely through encrypted Cloudflare edge notes. **No video data is ever saved to a server.** To guarantee security, the URL changes every time you launch the `.bat` file!