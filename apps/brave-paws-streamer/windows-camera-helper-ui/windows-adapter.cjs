const https = require('node:https');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { createWriteStream, existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');
const QRCode = require('qrcode');
const { STREAMER_DEPENDENCIES } = require('./streamer-assets.cjs');
const {
  STREAMER_EVENT_TYPES,
  buildPairingUrl,
} = require('./loopback-contract.cjs');

const MOCK_SECURE_URL = 'https://mock-brave-paws-camera.trycloudflare.com';
const MOCK_DEVICES = {
  video: ['Mock Windows Camera'],
  audio: ['Mock Windows Microphone'],
};
const LOCAL_PREVIEW_PROFILE = 'local-quality';
const LOCAL_PREVIEW_MODE = 'mse';
const REMOTE_PREVIEW_PROFILE = 'remote-low-latency';
const REMOTE_PREVIEW_MODE = 'mp4,mjpeg';
const REMOTE_ENCODING_PROFILE = {
  videoTemplate: 'brave_paws_h264_low_latency',
  audioTemplate: 'brave_paws_aac_low_latency',
  width: 960,
  height: 540,
  description: 'Remote low-latency profile enabled: lower bitrate, faster keyframes, and lighter audio for quicker recovery.',
};

function buildPreviewUrl(baseUrl, mode) {
  const previewUrl = new URL('/stream.html', `${baseUrl.replace(/\/+$/, '')}/`);
  previewUrl.searchParams.set('src', 'camera');
  previewUrl.searchParams.set('mode', mode);
  return previewUrl.toString();
}

function createPreviewState() {
  return {
    localUrl: '',
    publicUrl: '',
    remoteUrl: '',
    pairingUrl: '',
    qrCodeDataUrl: '',
    localProfile: LOCAL_PREVIEW_PROFILE,
    remoteProfile: REMOTE_PREVIEW_PROFILE,
    localMode: LOCAL_PREVIEW_MODE,
    remoteMode: REMOTE_PREVIEW_MODE,
  };
}

function createWindowsAdapter({
  appVersion,
  packageRoot,
  helperDir,
  isMockMode,
}) {
  const events = new EventEmitter();
  let go2rtcProc = null;
  let cloudflaredProc = null;
  let isStoppingIntentional = false;

  const state = {
    appVersion,
    status: 'idle',
    preview: createPreviewState(),
    selection: {
      video: '',
      audio: '',
    },
    dependencies: {
      go2rtc: {
        available: false,
        path: path.join(helperDir, 'go2rtc.exe'),
      },
      cloudflared: {
        available: false,
        path: path.join(helperDir, 'cloudflared.exe'),
      },
      ffmpeg: {
        available: false,
        path: '',
      },
    },
    devices: {
      video: [],
      audio: [],
      lastRefreshedAt: null,
    },
    logs: [],
    error: null,
    lastUpdatedAt: new Date().toISOString(),
  };

  function emitState(eventType = STREAMER_EVENT_TYPES.state, extraPayload = {}) {
    state.lastUpdatedAt = new Date().toISOString();
    events.emit(eventType, {
      ...extraPayload,
      snapshot: getSnapshot(),
    });
  }

  function setStatus(nextStatus) {
    state.status = nextStatus;
    emitState(STREAMER_EVENT_TYPES.status, { status: nextStatus });
  }

  function setError(code, message) {
    state.error = message
      ? {
          code,
          message,
        }
      : null;

    if (message) {
      emitState(STREAMER_EVENT_TYPES.error, { error: state.error });
    }
  }

  function addLog(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    state.logs = [line, ...state.logs].slice(0, 120);
    emitState(STREAMER_EVENT_TYPES.log, { line, logs: state.logs });
  }

  function getSnapshot() {
    return {
      appVersion: state.appVersion,
      status: state.status,
      preview: { ...state.preview },
      selection: { ...state.selection },
      dependencies: {
        go2rtc: { ...state.dependencies.go2rtc },
        cloudflared: { ...state.dependencies.cloudflared },
        ffmpeg: { ...state.dependencies.ffmpeg },
      },
      devices: {
        video: [...state.devices.video],
        audio: [...state.devices.audio],
        lastRefreshedAt: state.devices.lastRefreshedAt,
      },
      logs: [...state.logs],
      error: state.error ? { ...state.error } : null,
      lastUpdatedAt: state.lastUpdatedAt,
    };
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

  async function updateDependencyState() {
    state.dependencies.go2rtc.available = isMockMode || existsSync(path.join(helperDir, 'go2rtc.exe'));
    state.dependencies.cloudflared.available = isMockMode || existsSync(path.join(helperDir, 'cloudflared.exe'));
    state.dependencies.ffmpeg.path = await resolveFfmpegPath();
    state.dependencies.ffmpeg.available = Boolean(state.dependencies.ffmpeg.path);
  }

  async function ensureDependencies() {
    await fs.mkdir(helperDir, { recursive: true });

    if (isMockMode) {
      await updateDependencyState();
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

    await updateDependencyState();
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
      state.dependencies.ffmpeg.path = 'mock-ffmpeg.exe';
      state.dependencies.ffmpeg.available = true;
      state.devices = {
        ...MOCK_DEVICES,
        lastRefreshedAt: new Date().toISOString(),
      };
      emitState(STREAMER_EVENT_TYPES.devices, { devices: state.devices });
      return state.devices;
    }

    const ffmpegPath = await resolveFfmpegPath();
    state.dependencies.ffmpeg.path = ffmpegPath;
    state.dependencies.ffmpeg.available = Boolean(ffmpegPath);

    if (!ffmpegPath) {
      state.devices = {
        video: [],
        audio: [],
        lastRefreshedAt: new Date().toISOString(),
      };
      emitState(STREAMER_EVENT_TYPES.devices, { devices: state.devices });
      return state.devices;
    }

    const { stdout, stderr } = await runProcess(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], {
      allowNonZeroExit: true,
    });
    const devices = parseDevices(`${stdout}\n${stderr}`);
    state.devices = {
      ...devices,
      lastRefreshedAt: new Date().toISOString(),
    };
    emitState(STREAMER_EVENT_TYPES.devices, { devices: state.devices });
    return state.devices;
  }

  async function writeConfig(selectedVideo, selectedAudio) {
    const videoDevice = selectedVideo || '0';
    const audioDevice = selectedAudio || '0';
    const yamlContent = [
      'ffmpeg:',
      '  # Brave Paws remote playback is tuned for lower latency and quicker recovery on tunnel-based remote playback.',
      '  brave_paws_h264_low_latency: "-codec:v libx264 -pix_fmt yuv420p -preset:v superfast -tune:v zerolatency -g:v 30 -profile:v baseline -level:v 3.1 -b:v 1200k -maxrate:v 1200k -bufsize:v 1200k"',
      '  brave_paws_aac_low_latency: "-codec:a aac -ar 16000 -ac 1 -b:a 48k"',
      '',
      'streams:',
      '  camera:',
      `    - "ffmpeg:device?video=${videoDevice}&audio=${audioDevice}#video=${REMOTE_ENCODING_PROFILE.videoTemplate}#audio=${REMOTE_ENCODING_PROFILE.audioTemplate}#width=${REMOTE_ENCODING_PROFILE.width}#height=${REMOTE_ENCODING_PROFILE.height}"`,
      '',
    ].join('\n');

    await fs.writeFile(path.join(helperDir, 'go2rtc.yaml'), yamlContent, 'utf8');
    addLog(REMOTE_ENCODING_PROFILE.description);
  }

  async function updatePairingArtifacts() {
    if (!state.preview.publicUrl) {
      state.preview.remoteUrl = '';
      state.preview.pairingUrl = '';
      state.preview.qrCodeDataUrl = '';
      emitState();
      return;
    }

    state.preview.remoteUrl = buildPreviewUrl(state.preview.publicUrl, state.preview.remoteMode);
    state.preview.pairingUrl = buildPairingUrl(state.preview.publicUrl, {
      profile: state.preview.remoteProfile,
      mode: state.preview.remoteMode,
    });
    state.preview.qrCodeDataUrl = await QRCode.toDataURL(state.preview.pairingUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
      color: {
        dark: '#15202b',
        light: '#ffffffff',
      },
    });
    emitState();
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
        state.preview.publicUrl = urlMatch[0];
        void updatePairingArtifacts();
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

  async function stop() {
    isStoppingIntentional = true;

    if (!isMockMode) {
      await Promise.all([killProcessTree(cloudflaredProc), killProcessTree(go2rtcProc)]);
    }

    cloudflaredProc = null;
    go2rtcProc = null;
    state.preview = createPreviewState();
    setError('', '');
    addLog('Streaming stopped.');
    setStatus('idle');
    isStoppingIntentional = false;
    return getSnapshot();
  }

  async function start(videoDevice, audioDevice) {
    state.selection.video = videoDevice || '';
    state.selection.audio = audioDevice || '';
    state.preview = {
      ...createPreviewState(),
      publicUrl: '',
      pairingUrl: '',
      qrCodeDataUrl: '',
      localUrl: '',
      remoteUrl: '',
    };
    setError('', '');
    setStatus('bootstrapping');
    addLog('Preparing Brave Paws Streamer...');

    await ensureDependencies();
    if (!state.dependencies.ffmpeg.available) {
      throw new Error('Failed to download or locate FFmpeg after setup. Check your internet connection and try again.');
    }

    if (isMockMode) {
      await stop();
      setStatus('starting');
      state.preview.localUrl = buildPreviewUrl('http://127.0.0.1:1984', state.preview.localMode);
      state.preview.publicUrl = MOCK_SECURE_URL;
      await updatePairingArtifacts();
      addLog('Mock mode enabled. Skipping live stream startup.');
      addLog(`Secure tunnel ready: ${MOCK_SECURE_URL}`);
      setStatus('running');
      return getSnapshot();
    }

    await writeConfig(videoDevice, audioDevice);
    await stop();

    setStatus('starting');
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

    state.preview.localUrl = buildPreviewUrl('http://127.0.0.1:1984', state.preview.localMode);
    emitState();

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for a secure stream link.'));
      }, 30000);

      const poll = setInterval(() => {
        if (state.preview.publicUrl) {
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

    setStatus('running');
    return getSnapshot();
  }

  async function bootstrap() {
    await ensureDependencies();
    await listDevices();
    emitState(STREAMER_EVENT_TYPES.hello, { bootstrap: true });
    return getSnapshot();
  }

  async function refreshDevices() {
    await listDevices();
    return getSnapshot();
  }

  async function shutdown() {
    await stop();
  }

  return {
    bootstrap,
    events,
    getSnapshot,
    refreshDevices,
    setError,
    setStatus,
    shutdown,
    start,
    stop,
  };
}

module.exports = {
  createWindowsAdapter,
};
