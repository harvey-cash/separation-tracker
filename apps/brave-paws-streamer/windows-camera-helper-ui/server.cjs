const express = require('express');
const https = require('node:https');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createWriteStream, existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');
const QRCode = require('qrcode');
const { STREAMER_DEPENDENCIES } = require('./streamer-assets.cjs');

const packageRoot = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const helperDir = path.join(packageRoot, process.pkg ? 'brave-paws-streamer' : 'windows-camera-helper');
const publicDir = process.pkg
  ? path.join(packageRoot, 'windows-camera-helper-ui', 'public')
  : path.join(__dirname, 'public');
const port = Number(process.env.CAMERA_HELPER_PORT || 4380);
const shouldOpenBrowser = process.env.CAMERA_HELPER_NO_OPEN !== '1';
const isMockMode = process.env.CAMERA_HELPER_MOCK === '1';

const MOCK_SECURE_URL = 'https://mock-brave-paws-camera.trycloudflare.com';
const BRAVE_PAWS_PAIRING_URL = 'https://harvey.cash/fermi/separation';
const MOCK_DEVICES = {
  video: ['Mock Windows Camera'],
  audio: ['Mock Windows Microphone'],
};

let go2rtcProc = null;
let cloudflaredProc = null;
let isStoppingIntentional = false;

const state = {
  status: 'idle',
  secureUrl: '',
  localPreviewUrl: '',
  qrCodeDataUrl: '',
  selectedVideo: '',
  selectedAudio: '',
  ffmpegPath: '',
  ffmpegAvailable: false,
  devices: {
    video: [],
    audio: [],
  },
  logs: [],
  error: '',
};

function addLog(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  state.logs = [line, ...state.logs].slice(0, 120);
}

async function updateQrCodeDataUrl() {
  if (!state.secureUrl) {
    state.qrCodeDataUrl = '';
    return;
  }

  const pairingUrl = new URL(BRAVE_PAWS_PAIRING_URL);
  pairingUrl.searchParams.set('cameraUrl', state.secureUrl);

  state.qrCodeDataUrl = await QRCode.toDataURL(pairingUrl.toString(), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
    color: {
      dark: '#15202b',
      light: '#ffffffff',
    },
  });
}

function jsonError(message, statusCode = 500) {
  return { error: message, statusCode };
}

function runProcess(filePath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(filePath, args, {
      cwd: options.cwd,
      windowsHide: true,
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || options.allowNonZeroExit) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr || stdout || `${filePath} exited with code ${code}`));
    });
  });
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode} for ${url}`));
        return;
      }

      const output = createWriteStream(destination);
      pipeline(response, output).then(resolve).catch(reject);
    });

    request.on('error', reject);
  });
}

function escapePowerShellPath(filePath) {
  return filePath.replace(/'/g, "''");
}

async function extractFileFromZip(zipPath, extractedFileName, destinationPath) {
  const tempExtractionDir = path.join(
    helperDir,
    `${path.basename(extractedFileName, path.extname(extractedFileName))}-extract-${Date.now()}-${process.pid}`,
  );
  const escapedExtractedFileName = escapePowerShellPath(extractedFileName);

  await fs.rm(tempExtractionDir, { recursive: true, force: true });
  await fs.mkdir(tempExtractionDir, { recursive: true });

  try {
    await runProcess('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${escapePowerShellPath(zipPath)}' -DestinationPath '${escapePowerShellPath(tempExtractionDir)}' -Force`,
    ]);

    const { stdout } = await runProcess('powershell.exe', [
      '-NoProfile',
      '-Command',
      [
        `$file = Get-ChildItem -Path '${escapePowerShellPath(tempExtractionDir)}' -Recurse -File -Filter '${escapedExtractedFileName}' | Select-Object -First 1 -ExpandProperty FullName`,
        `if (-not $file) { throw "Unable to locate ${escapedExtractedFileName} in the downloaded archive. Check your internet connection and try again." }`,
        'Write-Output $file',
      ].join('; '),
    ]);

    const extractedPath = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (!extractedPath) {
      throw new Error(`Unable to locate ${extractedFileName} in the downloaded archive. Check your internet connection and try again.`);
    }

    await fs.copyFile(extractedPath, destinationPath);
  } finally {
    await fs.rm(zipPath, { force: true });
    await fs.rm(tempExtractionDir, { recursive: true, force: true });
  }
}

async function ensureDependencies() {
  await fs.mkdir(helperDir, { recursive: true });

  if (isMockMode) {
    return;
  }

  for (const dependency of STREAMER_DEPENDENCIES) {
    const dependencyPath = path.join(helperDir, dependency.fileName);
    if (existsSync(dependencyPath)) {
      continue;
    }

    if (dependency.checkSystemPath) {
      const existingFfmpegPath = await resolveFfmpegPath();
      if (existingFfmpegPath) {
        continue;
      }
    }

    addLog(`Downloading ${dependency.logLabel}...`);

    if (dependency.archiveFileName && dependency.extractedFileName) {
      const archivePath = path.join(helperDir, dependency.archiveFileName);
      await downloadFile(dependency.downloadUrl, archivePath);
      await extractFileFromZip(archivePath, dependency.extractedFileName, dependencyPath);
      continue;
    }

    await downloadFile(dependency.downloadUrl, dependencyPath);
  }
}

async function resolveFfmpegPath() {
  if (isMockMode) {
    return 'mock-ffmpeg.exe';
  }

  const localPath = path.join(helperDir, 'ffmpeg.exe');
  if (existsSync(localPath)) {
    return localPath;
  }

  try {
    const { stdout } = await runProcess('where.exe', ['ffmpeg']);
    const firstPath = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return firstPath || '';
  } catch {
    return '';
  }
}

function parseDevices(output) {
  const video = [];
  const audio = [];
  let currentType = 'none';

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.includes('DirectShow video devices')) {
      currentType = 'video';
      continue;
    }

    if (line.includes('DirectShow audio devices')) {
      currentType = 'audio';
      continue;
    }

    const typedMatch = line.match(/\]\s*"([^"]+)" \((video|audio)\)/i);
    if (typedMatch) {
      if (typedMatch[2].toLowerCase() === 'video') {
        video.push(typedMatch[1]);
      } else {
        audio.push(typedMatch[1]);
      }
      continue;
    }

    const genericMatch = line.match(/\]\s*"([^"]+)"/);
    if (genericMatch && !line.includes('Alternative name')) {
      if (currentType === 'video') {
        video.push(genericMatch[1]);
      }
      if (currentType === 'audio') {
        audio.push(genericMatch[1]);
      }
    }
  }

  return { video, audio };
}

async function listDevices() {
  if (isMockMode) {
    state.ffmpegPath = 'mock-ffmpeg.exe';
    state.ffmpegAvailable = true;
    state.devices = MOCK_DEVICES;
    return state.devices;
  }

  const ffmpegPath = await resolveFfmpegPath();
  state.ffmpegPath = ffmpegPath;
  state.ffmpegAvailable = Boolean(ffmpegPath);

  if (!ffmpegPath) {
    state.devices = { video: [], audio: [] };
    return state.devices;
  }

  const { stdout, stderr } = await runProcess(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], {
    allowNonZeroExit: true,
  });
  const devices = parseDevices(`${stdout}\n${stderr}`);
  state.devices = devices;
  return devices;
}

async function writeConfig(selectedVideo, selectedAudio) {
  const videoDevice = selectedVideo || '0';
  const audioDevice = selectedAudio || '0';
  const yamlContent = [
    'streams:',
    '  camera:',
    `    - "ffmpeg:device?video=${videoDevice}&audio=${audioDevice}#video=h264#audio=aac"`,
    '',
  ].join('\n');

  await fs.writeFile(path.join(helperDir, 'go2rtc.yaml'), yamlContent, 'utf8');
}

function attachProcessLogs(proc, label) {
  proc.stdout?.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      addLog(`${label}: ${text}`);
    }
  });

  proc.stderr?.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      addLog(`${label}: ${text}`);
    }

    const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (urlMatch) {
      state.secureUrl = urlMatch[0];
      void updateQrCodeDataUrl();
      addLog(`Secure tunnel ready: ${urlMatch[0]}`);
    }
  });

  proc.on('exit', (code) => {
    if (isStoppingIntentional) {
      return;
    }

    addLog(`${label} exited${code === null ? '' : ` with code ${code}`}.`);
  });
}

async function killProcessTree(proc) {
  if (!proc || proc.exitCode !== null) {
    return;
  }

  try {
    await runProcess('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F']);
  } catch {
    try {
      proc.kill();
    } catch {
      return;
    }
  }
}

async function stopStreaming() {
  isStoppingIntentional = true;

  if (!isMockMode) {
    await Promise.all([killProcessTree(cloudflaredProc), killProcessTree(go2rtcProc)]);
  }

  cloudflaredProc = null;
  go2rtcProc = null;
  state.status = 'idle';
  state.secureUrl = '';
  state.localPreviewUrl = '';
  state.qrCodeDataUrl = '';
  state.error = '';
  addLog('Streaming stopped.');
  isStoppingIntentional = false;
}

async function startStreaming(videoDevice, audioDevice) {
  state.status = 'bootstrapping';
  state.error = '';
  state.secureUrl = '';
  state.qrCodeDataUrl = '';
  state.localPreviewUrl = '';
  state.selectedVideo = videoDevice || '';
  state.selectedAudio = audioDevice || '';
  addLog('Preparing Brave Paws Streamer...');

  await ensureDependencies();

  const ffmpegPath = await resolveFfmpegPath();
  state.ffmpegPath = ffmpegPath;
  state.ffmpegAvailable = Boolean(ffmpegPath);

  if (!ffmpegPath) {
    throw new Error('Failed to download or locate FFmpeg after setup. Check your internet connection and try again.');
  }

  if (isMockMode) {
    await stopStreaming();
    state.status = 'starting';
    state.localPreviewUrl = 'http://127.0.0.1:1984/stream.html?src=camera&mode=mse';
    state.secureUrl = MOCK_SECURE_URL;
    await updateQrCodeDataUrl();
    addLog('Mock mode enabled. Skipping live stream startup.');
    addLog(`Secure tunnel ready: ${MOCK_SECURE_URL}`);
    state.status = 'running';
    return buildStatePayload();
  }

  await writeConfig(videoDevice, audioDevice);
  await stopStreaming();

  state.status = 'starting';
  addLog('Starting go2rtc...');
  go2rtcProc = spawn(path.join(helperDir, 'go2rtc.exe'), [], {
    cwd: helperDir,
    windowsHide: true,
    shell: false,
  });
  attachProcessLogs(go2rtcProc, 'go2rtc');

  addLog('Starting secure stream link...');
  cloudflaredProc = spawn(path.join(helperDir, 'cloudflared.exe'), ['tunnel', '--url', 'http://127.0.0.1:1984'], {
    cwd: helperDir,
    windowsHide: true,
    shell: false,
  });
  attachProcessLogs(cloudflaredProc, 'cloudflared');

  state.localPreviewUrl = 'http://127.0.0.1:1984/stream.html?src=camera&mode=mse';

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for a secure stream link.'));
    }, 30000);

    const poll = setInterval(() => {
      if (state.secureUrl) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
        return;
      }

      if (cloudflaredProc?.exitCode !== null) {
        clearTimeout(timeout);
        clearInterval(poll);
        reject(new Error('Secure stream process exited before a public URL was ready.'));
      }
    }, 250);
  });

  state.status = 'running';
  return buildStatePayload();
}

function buildStatePayload() {
  return {
    status: state.status,
    secureUrl: state.secureUrl,
    localPreviewUrl: state.localPreviewUrl,
    qrCodeDataUrl: state.qrCodeDataUrl,
    selectedVideo: state.selectedVideo,
    selectedAudio: state.selectedAudio,
    ffmpegPath: state.ffmpegPath,
    ffmpegAvailable: state.ffmpegAvailable,
    devices: state.devices,
    logs: state.logs,
    error: state.error,
  };
}

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

app.get('/api/bootstrap', async (_request, response) => {
  try {
    await ensureDependencies();
    await listDevices();
    response.json(buildStatePayload());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bootstrap failed.';
    state.error = message;
    state.status = 'error';
    response.status(500).json(jsonError(message));
  }
});

app.get('/api/status', async (_request, response) => {
  response.json(buildStatePayload());
});

app.post('/api/refresh-devices', async (_request, response) => {
  try {
    await listDevices();
    response.json(buildStatePayload());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list devices.';
    state.error = message;
    response.status(500).json(jsonError(message));
  }
});

app.post('/api/start', async (request, response) => {
  try {
    const { videoDevice = '', audioDevice = '' } = request.body || {};
    const payload = await startStreaming(videoDevice, audioDevice);
    response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start streaming.';
    await stopStreaming();
    state.error = message;
    state.status = 'error';
    addLog(`Error: ${message}`);
    response.status(500).json(jsonError(message));
  }
});

app.post('/api/stop', async (_request, response) => {
  await stopStreaming();
  response.json(buildStatePayload());
});

app.listen(port, () => {
  addLog(`Brave Paws Streamer listening on http://127.0.0.1:${port}`);
  if (isMockMode) {
    addLog('Brave Paws Streamer mock mode is enabled.');
  }
  console.log(`Brave Paws Streamer running at http://127.0.0.1:${port}`);

  if (shouldOpenBrowser) {
    spawn('cmd.exe', ['/c', 'start', '', `http://127.0.0.1:${port}`], {
      cwd: packageRoot,
      detached: true,
      windowsHide: true,
      shell: false,
    }).unref();
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await stopStreaming();
    process.exit(0);
  });
}
