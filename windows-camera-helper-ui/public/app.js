const elements = {
  videoDevice: document.querySelector('#video-device'),
  audioDevice: document.querySelector('#audio-device'),
  statusCard: document.querySelector('#status-card'),
  statusText: document.querySelector('#status-text'),
  statusPill: document.querySelector('#status-pill'),
  startButton: document.querySelector('#start-stream'),
  stopButton: document.querySelector('#stop-stream'),
  refreshButton: document.querySelector('#refresh-devices'),
  qrCard: document.querySelector('#qr-card'),
  qrImage: document.querySelector('#qr-image'),
  openLocalPreview: document.querySelector('#open-local-preview'),
  fullscreenPreview: document.querySelector('#fullscreen-preview'),
  previewIframe: document.querySelector('#preview-iframe'),
  previewEmpty: document.querySelector('#preview-empty'),
  previewPanel: document.querySelector('#preview-panel'),
  logCard: document.querySelector('#log-card'),
  toggleLogsButton: document.querySelector('#toggle-logs'),
  logList: document.querySelector('#log-list'),
};

let currentState = null;
let areLogsExpanded = false;

function arraysEqual(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function setStatus(status, detail) {
  elements.statusText.textContent = detail;
  elements.statusPill.textContent = status;
}

function renderLogCardState() {
  elements.logCard.classList.toggle('collapsed', !areLogsExpanded);
  elements.toggleLogsButton.textContent = areLogsExpanded ? 'Hide Logs' : 'Show Logs';
  elements.toggleLogsButton.setAttribute('aria-expanded', String(areLogsExpanded));
}

function populateSelect(select, options, fallbackLabel) {
  const currentOptions = Array.from(select.options).map((option) => option.value);
  const nextOptions = options.length ? options : [''];

  if (arraysEqual(currentOptions, nextOptions)) {
    if (!options.length && select.options[0]?.textContent !== fallbackLabel) {
      select.options[0].textContent = fallbackLabel;
    }
    return;
  }

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
  const nextLogSignature = logs.join('\n');
  if (elements.logList.dataset.signature === nextLogSignature) {
    return;
  }

  elements.logList.innerHTML = '';
  elements.logList.dataset.signature = nextLogSignature;

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
    if (elements.previewIframe.getAttribute('src')) {
      elements.previewIframe.removeAttribute('src');
    }
    elements.openLocalPreview.disabled = true;
    elements.fullscreenPreview.disabled = true;
    return;
  }

  if (elements.previewIframe.getAttribute('src') !== url) {
    elements.previewIframe.src = url;
  }
  elements.previewIframe.classList.remove('hidden');
  elements.previewEmpty.classList.add('hidden');
  elements.openLocalPreview.disabled = false;
  elements.fullscreenPreview.disabled = false;
}

function applyQr(url, remotePreviewUrl, qrCodeDataUrl) {
  if (!url) {
    elements.qrCard.classList.add('hidden');
    if (elements.qrImage.getAttribute('src')) {
      elements.qrImage.removeAttribute('src');
    }
    return;
  }

  elements.qrCard.classList.remove('hidden');
  if ((elements.qrImage.getAttribute('src') || '') !== (qrCodeDataUrl || '')) {
    elements.qrImage.src = qrCodeDataUrl || '';
  }
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
    ? 'Stream live and pairing QR ready.'
    : state.status === 'starting' || state.status === 'bootstrapping'
    ? 'Starting stream services and preparing your pairing QR…'
    : 'Ready to start.');

  setStatus(statusLabel, detail);
  elements.statusCard.classList.toggle(
    'compact',
    state.status === 'running' || (state.status === 'idle' && !state.error),
  );

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
elements.toggleLogsButton.addEventListener('click', () => {
  areLogsExpanded = !areLogsExpanded;
  renderLogCardState();
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

renderLogCardState();
bootstrap();
setInterval(pollStatus, 3000);