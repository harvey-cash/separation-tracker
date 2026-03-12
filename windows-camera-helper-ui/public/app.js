const elements = {
  videoDevice: document.querySelector('#video-device'),
  audioDevice: document.querySelector('#audio-device'),
  statusText: document.querySelector('#status-text'),
  statusPill: document.querySelector('#status-pill'),
  ffmpegText: document.querySelector('#ffmpeg-text'),
  startButton: document.querySelector('#start-stream'),
  stopButton: document.querySelector('#stop-stream'),
  refreshButton: document.querySelector('#refresh-devices'),
  qrCard: document.querySelector('#qr-card'),
  qrImage: document.querySelector('#qr-image'),
  secureUrl: document.querySelector('#secure-url'),
  copyLink: document.querySelector('#copy-link'),
  openLink: document.querySelector('#open-link'),
  openRemotePreview: document.querySelector('#open-remote-preview'),
  openLocalPreview: document.querySelector('#open-local-preview'),
  fullscreenPreview: document.querySelector('#fullscreen-preview'),
  previewIframe: document.querySelector('#preview-iframe'),
  previewEmpty: document.querySelector('#preview-empty'),
  previewPanel: document.querySelector('#preview-panel'),
  logList: document.querySelector('#log-list'),
};

let currentState = null;

function setStatus(status, detail) {
  elements.statusText.textContent = detail;
  elements.statusPill.textContent = status;
}

function populateSelect(select, options, fallbackLabel) {
  select.innerHTML = '';

  if (!options.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = fallbackLabel;
    select.appendChild(option);
    return;
  }

  options.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = `${index + 1}. ${item}`;
    select.appendChild(option);
  });
}

function setLogs(logs) {
  elements.logList.innerHTML = '';

  if (!logs.length) {
    const item = document.createElement('div');
    item.className = 'log-item';
    item.textContent = 'No activity yet.';
    elements.logList.appendChild(item);
    return;
  }

  logs.forEach((line) => {
    const item = document.createElement('div');
    item.className = 'log-item';
    item.textContent = line;
    elements.logList.appendChild(item);
  });
}

function applyPreview(url) {
  if (!url) {
    elements.previewIframe.classList.add('hidden');
    elements.previewEmpty.classList.remove('hidden');
    elements.previewIframe.removeAttribute('src');
    elements.openLocalPreview.disabled = true;
    elements.fullscreenPreview.disabled = true;
    return;
  }

  elements.previewIframe.src = url;
  elements.previewIframe.classList.remove('hidden');
  elements.previewEmpty.classList.add('hidden');
  elements.openLocalPreview.disabled = false;
  elements.fullscreenPreview.disabled = false;
}

function applyQr(url, remotePreviewUrl, qrCodeDataUrl) {
  if (!url) {
    elements.qrCard.classList.add('hidden');
    elements.secureUrl.textContent = '';
    elements.qrImage.removeAttribute('src');
    elements.openLink.disabled = true;
    elements.copyLink.disabled = true;
    elements.openRemotePreview.disabled = true;
    return;
  }

  elements.qrCard.classList.remove('hidden');
  elements.secureUrl.textContent = url;
  elements.qrImage.src = qrCodeDataUrl || '';
  elements.openLink.disabled = false;
  elements.copyLink.disabled = false;
  elements.openRemotePreview.disabled = !remotePreviewUrl;
}

function render(state) {
  currentState = state;
  const statusLabel = state.status === 'running'
    ? 'Live'
    : state.status === 'starting' || state.status === 'bootstrapping'
    ? 'Starting'
    : state.status === 'error'
    ? 'Attention'
    : 'Idle';

  const detail = state.error || (state.status === 'running'
    ? 'Camera live and QR ready.'
    : state.status === 'starting' || state.status === 'bootstrapping'
    ? 'Starting camera services and waiting for Cloudflare…'
    : 'Ready to start.');

  setStatus(statusLabel, detail);
  elements.ffmpegText.textContent = state.ffmpegAvailable
    ? `Using ${state.ffmpegPath}`
    : 'FFmpeg was not found. Place ffmpeg.exe in windows-camera-helper or install it on PATH.';

  populateSelect(elements.videoDevice, state.devices.video || [], 'No camera found');
  populateSelect(elements.audioDevice, state.devices.audio || [], 'No microphone found');

  if (state.selectedVideo) {
    elements.videoDevice.value = state.selectedVideo;
  }
  if (state.selectedAudio) {
    elements.audioDevice.value = state.selectedAudio;
  }

  applyPreview(state.localPreviewUrl);
  applyQr(state.secureUrl, state.remotePreviewUrl, state.qrCodeDataUrl);
  setLogs(state.logs || []);

  const isBusy = state.status === 'starting' || state.status === 'bootstrapping';
  const isRunning = state.status === 'running';
  elements.startButton.disabled = isBusy || !state.ffmpegAvailable;
  elements.stopButton.disabled = !isRunning && !isBusy;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed.' }));
    throw new Error(payload.error || 'Request failed.');
  }

  return response.json();
}

async function bootstrap() {
  try {
    const payload = await request('/api/bootstrap');
    render(payload);
  } catch (error) {
    setStatus('Attention', error instanceof Error ? error.message : 'Bootstrap failed.');
  }
}

async function refreshDevices() {
  try {
    setStatus('Loading', 'Refreshing camera and microphone list…');
    const payload = await request('/api/refresh-devices', { method: 'POST' });
    render(payload);
  } catch (error) {
    setStatus('Attention', error instanceof Error ? error.message : 'Unable to refresh devices.');
  }
}

async function startStream() {
  try {
    setStatus('Starting', 'Starting camera services and requesting a secure URL…');
    const payload = await request('/api/start', {
      method: 'POST',
      body: JSON.stringify({
        videoDevice: elements.videoDevice.value,
        audioDevice: elements.audioDevice.value,
      }),
    });
    render(payload);
  } catch (error) {
    setStatus('Attention', error instanceof Error ? error.message : 'Unable to start camera.');
  }
}

async function stopStream() {
  const payload = await request('/api/stop', { method: 'POST' });
  render(payload);
}

async function pollStatus() {
  try {
    const payload = await request('/api/status');
    render(payload);
  } catch {
    return;
  }
}

elements.refreshButton.addEventListener('click', refreshDevices);
elements.startButton.addEventListener('click', startStream);
elements.stopButton.addEventListener('click', stopStream);
elements.copyLink.addEventListener('click', async () => {
  if (!currentState?.secureUrl) {
    return;
  }

  await navigator.clipboard.writeText(currentState.secureUrl);
});
elements.openLink.addEventListener('click', () => {
  if (currentState?.secureUrl) {
    window.open(currentState.secureUrl, '_blank', 'noopener,noreferrer');
  }
});
elements.openRemotePreview.addEventListener('click', () => {
  if (currentState?.remotePreviewUrl) {
    window.open(currentState.remotePreviewUrl, '_blank', 'noopener,noreferrer');
  }
});
elements.openLocalPreview.addEventListener('click', () => {
  if (currentState?.localPreviewUrl) {
    window.open(currentState.localPreviewUrl, '_blank', 'noopener,noreferrer');
  }
});
elements.fullscreenPreview.addEventListener('click', async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  await elements.previewPanel.requestFullscreen();
});

bootstrap();
setInterval(pollStatus, 3000);