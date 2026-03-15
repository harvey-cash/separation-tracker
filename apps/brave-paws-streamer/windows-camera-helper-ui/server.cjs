const express = require('express');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const {
  DEFAULT_LOOPBACK_HOST,
  DEFAULT_LOOPBACK_PORT,
  LOOPBACK_API_PATHS,
  STREAMER_EVENT_TYPES,
  STREAMER_HELPER_NAME,
  STREAMER_HELPER_PLATFORM,
  STREAMER_PROTOCOL_VERSION,
  buildHostedUiOpenCommandArgs,
  buildHostedUiLaunchUrl,
  buildLoopbackBaseUrl,
  createAuthMiddleware,
  createCorsMiddleware,
  createLaunchToken,
  getStreamerUiUrl,
  jsonError,
  parseAllowedOrigins,
  writeSseEvent,
} = require('./loopback-contract.cjs');
const { createWindowsAdapter } = require('./windows-adapter.cjs');

const packageRoot = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const workspaceRoot = process.pkg ? packageRoot : path.resolve(packageRoot, '..', '..');
const helperDir = path.join(packageRoot, process.pkg ? 'brave-paws-streamer' : 'windows-camera-helper');
const port = Number(process.env.CAMERA_HELPER_PORT || DEFAULT_LOOPBACK_PORT);
const shouldOpenBrowser = process.env.CAMERA_HELPER_NO_OPEN !== '1';
const isMockMode = process.env.CAMERA_HELPER_MOCK === '1';
const STREAMER_PROTOCOL_SCHEME = 'brave-paws-streamer';
const launchToken = createLaunchToken();
const allowedOrigins = parseAllowedOrigins();
const loopbackBaseUrl = buildLoopbackBaseUrl(port, DEFAULT_LOOPBACK_HOST);
const launchUrl = buildHostedUiLaunchUrl({ port, token: launchToken });
const appVersion = getAppVersion();

const adapter = createWindowsAdapter({
  appVersion,
  packageRoot,
  helperDir,
  isMockMode,
});

function getAppVersion() {
  try {
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function setRegistryValue(key, name, value) {
  return new Promise((resolve, reject) => {
    const args = ['add', key, '/f'];
    if (name) {
      args.push('/v', name);
    } else {
      args.push('/ve');
    }
    args.push('/d', value);

    const child = spawn('reg.exe', args, {
      windowsHide: true,
      shell: false,
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `Unable to set registry value ${name || 'default value'} at ${key}.`));
    });
  });
}

function getProtocolHandlerCommand() {
  if (process.pkg) {
    return `"${process.execPath}" "%1"`;
  }

  return `"${process.execPath}" "${__filename}" "%1"`;
}

async function ensureProtocolHandler() {
  if (process.platform !== 'win32') {
    return;
  }

  const protocolKey = `HKCU\\Software\\Classes\\${STREAMER_PROTOCOL_SCHEME}`;
  await setRegistryValue(protocolKey, '', 'URL:Brave Paws Streamer Protocol');
  await setRegistryValue(protocolKey, 'URL Protocol', '');
  await setRegistryValue(`${protocolKey}\\shell\\open\\command`, '', getProtocolHandlerCommand());
}

function buildPayload(snapshot = adapter.getSnapshot()) {
  return {
    protocolVersion: STREAMER_PROTOCOL_VERSION,
    helper: {
      name: STREAMER_HELPER_NAME,
      platform: STREAMER_HELPER_PLATFORM,
      version: appVersion,
      apiBaseUrl: loopbackBaseUrl,
      uiUrl: getStreamerUiUrl(),
      eventStreamUrl: `${loopbackBaseUrl}${LOOPBACK_API_PATHS.events}`,
    },
    session: {
      launchToken,
    },
    api: {
      bootstrap: LOOPBACK_API_PATHS.bootstrap,
      status: LOOPBACK_API_PATHS.status,
      refreshDevices: LOOPBACK_API_PATHS.refreshDevices,
      start: LOOPBACK_API_PATHS.start,
      stop: LOOPBACK_API_PATHS.stop,
      events: LOOPBACK_API_PATHS.events,
    },
    state: snapshot,
  };
}

const eventClients = new Set();

function broadcastEvent(eventType, payload) {
  const messagePayload = {
    protocolVersion: STREAMER_PROTOCOL_VERSION,
    helper: {
      name: STREAMER_HELPER_NAME,
      platform: STREAMER_HELPER_PLATFORM,
      version: appVersion,
    },
    ...payload,
  };

  for (const client of eventClients) {
    writeSseEvent(client, eventType, messagePayload);
  }
}

adapter.events.on(STREAMER_EVENT_TYPES.hello, ({ snapshot }) => {
  broadcastEvent(STREAMER_EVENT_TYPES.hello, { state: snapshot });
});
adapter.events.on(STREAMER_EVENT_TYPES.state, ({ snapshot }) => {
  broadcastEvent(STREAMER_EVENT_TYPES.state, { state: snapshot });
});
adapter.events.on(STREAMER_EVENT_TYPES.status, ({ snapshot, status }) => {
  broadcastEvent(STREAMER_EVENT_TYPES.status, { status, state: snapshot });
});
adapter.events.on(STREAMER_EVENT_TYPES.devices, ({ snapshot, devices }) => {
  broadcastEvent(STREAMER_EVENT_TYPES.devices, { devices, state: snapshot });
});
adapter.events.on(STREAMER_EVENT_TYPES.log, ({ snapshot, line, logs }) => {
  broadcastEvent(STREAMER_EVENT_TYPES.log, { line, logs, state: snapshot });
});
adapter.events.on(STREAMER_EVENT_TYPES.error, ({ snapshot, error }) => {
  broadcastEvent(STREAMER_EVENT_TYPES.error, { error, state: snapshot });
});

const app = express();
app.use(express.json());
app.use(createCorsMiddleware({ allowedOrigins }));

app.get(LOOPBACK_API_PATHS.manifest, (_request, response) => {
  response.json({
    name: 'Brave Paws Streamer Loopback API',
    protocolVersion: STREAMER_PROTOCOL_VERSION,
    helper: {
      name: STREAMER_HELPER_NAME,
      platform: STREAMER_HELPER_PLATFORM,
      version: appVersion,
    },
    apiBaseUrl: loopbackBaseUrl,
    uiUrl: getStreamerUiUrl(),
  });
});

app.use('/api', createAuthMiddleware({ launchToken, allowedOrigins }));

app.get(LOOPBACK_API_PATHS.bootstrap, async (_request, response) => {
  try {
    const snapshot = await adapter.bootstrap();
    response.json(buildPayload(snapshot));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bootstrap failed.';
    adapter.setError('BOOTSTRAP_FAILED', message);
    adapter.setStatus('error');
    response.status(500).json(jsonError(message, 500, 'BOOTSTRAP_FAILED'));
  }
});

app.get(LOOPBACK_API_PATHS.status, (_request, response) => {
  response.json(buildPayload());
});

app.get(LOOPBACK_API_PATHS.events, (request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  response.write(': connected\n\n');
  eventClients.add(response);
  writeSseEvent(response, STREAMER_EVENT_TYPES.hello, buildPayload());

  request.on('close', () => {
    eventClients.delete(response);
  });
});

app.post(LOOPBACK_API_PATHS.refreshDevices, async (_request, response) => {
  try {
    const snapshot = await adapter.refreshDevices();
    response.json(buildPayload(snapshot));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list devices.';
    adapter.setError('DEVICE_REFRESH_FAILED', message);
    response.status(500).json(jsonError(message, 500, 'DEVICE_REFRESH_FAILED'));
  }
});

app.post(LOOPBACK_API_PATHS.start, async (request, response) => {
  try {
    const { videoDevice = '', audioDevice = '' } = request.body || {};
    const snapshot = await adapter.start(videoDevice, audioDevice);
    response.json(buildPayload(snapshot));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start streaming.';
    await adapter.stop();
    adapter.setError('START_FAILED', message);
    adapter.setStatus('error');
    response.status(500).json(jsonError(message, 500, 'START_FAILED'));
  }
});

app.post(LOOPBACK_API_PATHS.stop, async (_request, response) => {
  const snapshot = await adapter.stop();
  response.json(buildPayload(snapshot));
});

app.listen(port, DEFAULT_LOOPBACK_HOST, () => {
  broadcastEvent(STREAMER_EVENT_TYPES.log, {
    line: `Brave Paws Streamer listening on ${loopbackBaseUrl}`,
    logs: adapter.getSnapshot().logs,
    state: adapter.getSnapshot(),
  });
  if (isMockMode) {
    broadcastEvent(STREAMER_EVENT_TYPES.log, {
      line: 'Brave Paws Streamer mock mode is enabled.',
      logs: adapter.getSnapshot().logs,
      state: adapter.getSnapshot(),
    });
  }
  console.log(`Brave Paws Streamer loopback API running at ${loopbackBaseUrl}`);
  console.log(`Hosted streamer UI launch URL: ${launchUrl}`);
  ensureProtocolHandler().catch((error) => {
    console.warn(`Unable to register ${STREAMER_PROTOCOL_SCHEME} protocol handler: ${error instanceof Error ? error.message : error}`);
  });

  if (shouldOpenBrowser) {
    spawn('cmd.exe', buildHostedUiOpenCommandArgs(launchUrl), {
      cwd: packageRoot,
      detached: true,
      windowsHide: true,
      shell: false,
    }).unref();
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await adapter.shutdown();
    process.exit(0);
  });
}
