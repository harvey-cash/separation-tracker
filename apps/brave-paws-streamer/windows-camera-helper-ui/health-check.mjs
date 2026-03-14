import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const port = Number(process.env.CAMERA_HELPER_PORT || 4381);
const serverUrl = `http://127.0.0.1:${port}`;
const useMockMode = process.env.CAMERA_HELPER_MOCK === '1';
const token = process.env.CAMERA_HELPER_TOKEN || 'health-check-token';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(resource, options) {
  const response = await fetch(`${serverUrl}${resource}`, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || `Request failed for ${resource}`);
  }

  return payload;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await requestJson('/');
      return;
    } catch {
      await delay(500);
    }
  }

  throw new Error('Timed out waiting for the helper server to become ready.');
}

async function main() {
  const serverProcess = spawn(process.execPath, ['windows-camera-helper-ui/server.cjs'], {
    cwd: packageRoot,
    windowsHide: true,
    env: {
      ...process.env,
      CAMERA_HELPER_NO_OPEN: '1',
      CAMERA_HELPER_PORT: String(port),
      CAMERA_HELPER_MOCK: useMockMode ? '1' : '0',
      CAMERA_HELPER_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    process.stdout.write(chunk.toString());
  });

  serverProcess.stderr.on('data', (chunk) => {
    process.stderr.write(chunk.toString());
  });

  try {
    await waitForServer();

    const headers = {
      'Content-Type': 'application/json',
      'x-brave-paws-session': token,
    };

    const bootstrap = await requestJson('/api/bootstrap', { headers });
    if (!bootstrap.state.dependencies.ffmpeg.available) {
      throw new Error('FFmpeg was not detected by the helper.');
    }

    if (!bootstrap.state.devices.video?.length) {
      throw new Error('No video devices were discovered by the helper.');
    }

    const selectedVideo = bootstrap.state.devices.video[0];
    const selectedAudio = bootstrap.state.devices.audio?.[0] || '';

    console.log(`Using video device: ${selectedVideo}`);
    if (selectedAudio) {
      console.log(`Using audio device: ${selectedAudio}`);
    }
    if (useMockMode) {
      console.log('Running helper health check in mock mode.');
    }

    const startPayload = await requestJson('/api/start', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        videoDevice: selectedVideo,
        audioDevice: selectedAudio,
      }),
    });

    if (startPayload.state.status !== 'running') {
      throw new Error(`Expected running status after start, received ${startPayload.state.status}.`);
    }

    if (!startPayload.state.preview.publicUrl || !startPayload.state.preview.localUrl || !startPayload.state.preview.qrCodeDataUrl) {
      throw new Error('Start payload did not include secure URL, local preview, and QR code data.');
    }

    console.log(`Secure URL: ${startPayload.state.preview.publicUrl}`);

    const stopPayload = await requestJson('/api/stop', { method: 'POST', headers });
    if (stopPayload.state.status !== 'idle') {
      throw new Error(`Expected idle status after stop, received ${stopPayload.state.status}.`);
    }

    console.log('Helper health check passed.');
  } finally {
    if (!serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await delay(500);
      if (serverProcess.exitCode === null) {
        serverProcess.kill('SIGKILL');
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});