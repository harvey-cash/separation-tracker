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
  currentTime: document.querySelector('#current-time'),
  appVersion: document.querySelector('#app-version'),
};

const LOOPBACK_TOKEN_PARAM = 'token';
const LOOPBACK_BASE_PARAM = 'loopback';
let currentPayload = null;
let eventSource = null;
let areLogsExpanded = false;

const clockFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function renderClock() {
  elements.currentTime.textContent = clockFormatter.format(new Date());
}

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

function sanitizeLoopbackBaseUrl(value) {
  try {
    const parsed = new URL(value);
    const isLoopbackHost = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'http:' || !isLoopbackHost) {
      return '';
    }

    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function getLaunchConfig() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    loopbackBaseUrl: sanitizeLoopbackBaseUrl(params.get(LOOPBACK_BASE_PARAM) || ''),
    token: (params.get(LOOPBACK_TOKEN_PARAM) || '').trim(),
  };
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

function applyQr(publicUrl, qrCodeDataUrl) {
  if (!publicUrl) {
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

function getModel(payload) {
  return payload?.state || null;
}

function renderDisconnected(detail) {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  currentPayload = null;
  elements.appVersion.textContent = 'Hosted UI';
  setStatus('Waiting', detail);
  elements.statusCard.classList.remove('compact');
  populateSelect(elements.videoDevice, [], 'Launch helper to list cameras');
  populateSelect(elements.audioDevice, [], 'Launch helper to list microphones');
  applyPreview('');
  applyQr('', '');
  setLogs([]);
  elements.startButton.disabled = true;
  elements.stopButton.disabled = true;
  elements.refreshButton.disabled = true;
}

function render(payload) {
  currentPayload = payload;
  const model = getModel(payload);

  if (!model) {
    renderDisconnected('Launch Brave Paws Streamer on Windows to connect this hosted control page.');
    return;
  }

  const errorMessage = model.error?.message || '';
  elements.appVersion.textContent = `v${payload.helper?.version || model.appVersion || '0.0.0'}`;

  const statusLabel = model.status === 'running'
    ? 'Live'
    : model.status === 'starting' || model.status === 'bootstrapping'
    ? 'Starting'
    : model.status === 'error'
    ? 'Attention'
    : 'Idle';

  const detail = errorMessage || (model.status === 'running'
    ? 'Stream live and pairing QR ready.'
    : model.status === 'starting' || model.status === 'bootstrapping'
    ? 'Starting stream services and preparing your pairing QR…'
    : 'Connected to the Windows helper.');

  setStatus(statusLabel, detail);
  elements.statusCard.classList.toggle(
    'compact',
    model.status === 'running' || (model.status === 'idle' && !errorMessage),
  );

  populateSelect(elements.videoDevice, model.devices?.video || [], 'No camera found');
  populateSelect(elements.audioDevice, model.devices?.audio || [], 'No microphone found');

  if (model.selection?.video) {
    elements.videoDevice.value = model.selection.video;
  }
  if (model.selection?.audio) {
    elements.audioDevice.value = model.selection.audio;
  }

  applyPreview(model.preview?.localUrl || '');
  applyQr(model.preview?.publicUrl || '', model.preview?.qrCodeDataUrl || '');
  setLogs(model.logs || []);

  const isBusy = model.status === 'starting' || model.status === 'bootstrapping';
  const isRunning = model.status === 'running';
  const ffmpegAvailable = Boolean(model.dependencies?.ffmpeg?.available);

  elements.refreshButton.disabled = false;
  elements.startButton.disabled = isBusy || !ffmpegAvailable;
  elements.stopButton.disabled = !isRunning && !isBusy;
}

async function request(apiPath, options = {}) {
  const launchConfig = getLaunchConfig();
  if (!launchConfig.loopbackBaseUrl || !launchConfig.token) {
    throw new Error('Launch the Windows helper to attach this hosted streamer page.');
  }

  const response = await fetch(`${launchConfig.loopbackBaseUrl}${apiPath}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-brave-paws-session': launchConfig.token,
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: { message: 'Request failed.' } }));
    throw new Error(payload.error?.message || 'Request failed.');
  }

  return response.json();
}

function connectEvents() {
  const launchConfig = getLaunchConfig();
  if (!launchConfig.loopbackBaseUrl || !launchConfig.token || typeof window.EventSource !== 'function') {
    return;
  }

  if (eventSource) {
    eventSource.close();
  }

  const eventsUrl = new URL(`${launchConfig.loopbackBaseUrl}/api/events`);
  eventsUrl.searchParams.set('token', launchConfig.token);
  eventSource = new EventSource(eventsUrl.toString());

  for (const eventName of ['hello', 'state', 'status', 'devices', 'log', 'error']) {
    eventSource.addEventListener(eventName, (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.state) {
          render({
            ...(currentPayload || {}),
            helper: currentPayload?.helper || payload.helper,
            state: payload.state,
          });
        }
      } catch {
        return;
      }
    });
  }
}

async function bootstrap() {
  const launchConfig = getLaunchConfig();
  if (!launchConfig.loopbackBaseUrl || !launchConfig.token) {
    renderDisconnected('Launch Brave Paws Streamer on Windows to connect this hosted control page.');
    return;
  }

  try {
    const payload = await request('/api/bootstrap');
    render(payload);
    connectEvents();
  } catch (error) {
    renderDisconnected(error instanceof Error ? error.message : 'Bootstrap failed.');
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
  try {
    setStatus('Stopping', 'Stopping camera services…');
    const payload = await request('/api/stop', { method: 'POST' });
    render(payload);
  } catch (error) {
    setStatus('Attention', error instanceof Error ? error.message : 'Unable to stop camera.');
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
  if (currentPayload?.state?.preview?.localUrl) {
    window.open(currentPayload.state.preview.localUrl, '_blank', 'noopener,noreferrer');
  }
});
elements.fullscreenPreview.addEventListener('click', async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  await elements.previewPanel.requestFullscreen();
});
window.addEventListener('hashchange', bootstrap);

renderLogCardState();
renderClock();
bootstrap();
setInterval(renderClock, 1000);
