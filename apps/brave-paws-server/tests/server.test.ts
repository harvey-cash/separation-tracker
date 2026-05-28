import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createBravePawsServer } from '../src/server.ts';
import { type BravePawsServerConfig } from '../src/config.ts';
import { getSessionsCsvFilePath } from '../src/storage.ts';

async function listen(server: http.Server, host = '127.0.0.1') {
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine server address');
  }
  return `http://${host}:${address.port}`;
}

async function close(server: http.Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function requestRaw(baseUrl: string, requestPath: string, headers?: http.OutgoingHttpHeaders) {
  const url = new URL(baseUrl);

  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: requestPath,
        method: 'GET',
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    request.on('error', reject);
    request.end();
  });
}

async function withFixtureServer(
  run: (context: { baseUrl: string; config: BravePawsServerConfig }) => Promise<void>,
  configOverrides: Partial<BravePawsServerConfig> = {},
) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-server-'));
  const landingDir = path.join(tempDir, 'landing');
  const appDir = path.join(tempDir, 'app');
  const dataDir = path.join(tempDir, 'data');
  await fs.mkdir(landingDir, { recursive: true });
  await fs.mkdir(appDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(landingDir, 'index.html'), '<html><body>landing</body></html>');
  await fs.writeFile(path.join(appDir, 'index.html'), '<html><body>app</body></html>');
  await fs.writeFile(path.join(appDir, 'asset.js'), 'console.log("ok")');

  const upstream = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`camera:${request.url}`);
  });
  const upstreamBaseUrl = await listen(upstream);

  const config: BravePawsServerConfig = {
    host: '127.0.0.1',
    port: 0,
    publicBaseUrl: null,
    landingBasePath: '/separation/',
    appBasePath: '/separation/app/',
    apiBasePath: '/separation/api/',
    cameraBasePath: '/separation/camera/',
    healthPath: '/separation/api/health',
    clientDiagnosticsPath: '/separation/api/client-diagnostics',
    landingDistDir: landingDir,
    appDistDir: appDir,
    dataDir,
    dataFilePath: path.join(dataDir, 'sessions.json'),
    pairingStoreFilePath: path.join(dataDir, 'pairings.json'),
    pairingEnabled: false,
    cameraUpstreamBaseUrl: `${upstreamBaseUrl}/`,
    cameraControlProvider: 'none',
    cameraControlLabel: 'Camera streaming',
    cameraControlStatusCommand: null,
    cameraControlEnableCommand: null,
    cameraControlDisableCommand: null,
    recordingProvider: 'none',
    recordingLabel: 'Session recording',
    recordingStatusCommand: null,
    recordingStartCommand: null,
    recordingStopCommand: null,
    authToken: null,
    corsAllowedOrigins: [],
    recordingsDir: path.join(dataDir, 'recordings'),
    ...configOverrides,
  };

  const server = createBravePawsServer(config);
  const baseUrl = await listen(server);

  try {
    await run({ baseUrl, config });
  } finally {
    await close(server);
    await close(upstream);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('health endpoint reports session metadata without leaking server file paths', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json() as { status: string; sessionCount: number; dataFilePath?: string; csvFilePath?: string; clientDiagnosticsFilePath?: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.sessionCount, 0);
    assert.equal(body.dataFilePath, undefined);
    assert.equal(body.csvFilePath, undefined);
    assert.equal(body.clientDiagnosticsFilePath, undefined);
  });
});

test('allowed CORS origins receive reflected headers on API responses', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/health`, {
      headers: {
        origin: 'https://harvey.cash',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://harvey.cash');
    assert.equal(response.headers.get('access-control-allow-methods'), 'GET,POST,PUT,OPTIONS');
    assert.equal(response.headers.get('access-control-allow-headers'), 'content-type,x-brave-paws-token');
    assert.match(response.headers.get('vary') || '', /Origin/);
  }, {
    corsAllowedOrigins: ['https://harvey.cash'],
  });
});

test('API OPTIONS preflight succeeds for allowed origins on sync routes', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    for (const requestPath of ['/separation/api/sync/pull', '/separation/api/sync/push']) {
      const response = await fetch(`${baseUrl}${requestPath}`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://harvey.cash',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });

      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://harvey.cash');
      assert.equal(response.headers.get('access-control-allow-methods'), 'GET,POST,PUT,OPTIONS');
      assert.equal(response.headers.get('access-control-allow-headers'), 'content-type,x-brave-paws-token');
    }
  }, {
    corsAllowedOrigins: ['https://harvey.cash'],
  });
});

test('disallowed origins do not receive permissive CORS headers', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/health`, {
      headers: {
        origin: 'https://evil.example',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), null);

    const preflight = await fetch(`${baseUrl}/separation/api/sync/push`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert.equal(preflight.status, 403);
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  }, {
    corsAllowedOrigins: ['https://harvey.cash'],
  });
});

test('camera capabilities report unsupported control by default', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/capabilities`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      cameraStreaming: { supported: boolean; canSetEnabled: boolean; enabled: boolean | null };
      sessionRecording: { supported: boolean; canStart: boolean; canStop: boolean; active: boolean };
    };
    assert.equal(body.cameraStreaming.supported, false);
    assert.equal(body.cameraStreaming.canSetEnabled, false);
    assert.equal(body.cameraStreaming.enabled, null);
    assert.equal(body.sessionRecording.supported, false);
    assert.equal(body.sessionRecording.canStart, false);
    assert.equal(body.sessionRecording.canStop, false);
    assert.equal(body.sessionRecording.active, false);
  });
});

test('session recording capability can be started and stopped through the command provider', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-recording-control-'));
  const stateFilePath = path.join(tempDir, 'recording-state.json');
  const recordingDir = path.join(tempDir, 'recordings');

  try {
    await withFixtureServer(async ({ baseUrl, config }) => {
      const before = await fetch(`${baseUrl}/separation/api/capabilities/recording`);
      assert.equal(before.status, 200);
      assert.equal((await before.json() as { active: boolean }).active, false);

      const startResponse = await fetch(`${baseUrl}/separation/api/recording/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session-123', sessionDate: '2026-05-09T18:00:00.000Z', sessionStatus: 'pending' }),
      });
      assert.equal(startResponse.status, 200);
      const started = await startResponse.json() as {
        active: boolean;
        sessionId: string | null;
        recording: { status: string; sessionId: string | null } | null;
      };
      assert.equal(started.active, true);
      assert.equal(started.sessionId, 'session-123');
      assert.equal(started.recording?.status, 'recording');

      const recordingSourcePath = path.join(recordingDir, '2026/05/09/session-123.mp4');
      await fs.mkdir(path.dirname(recordingSourcePath), { recursive: true });
      await fs.writeFile(recordingSourcePath, 'fake recording payload');

      const stopResponse = await fetch(`${baseUrl}/separation/api/recording/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session-123',
          disposition: 'save',
          sessionSnapshot: {
            id: 'session-123',
            date: '2026-05-09T18:00:00.000Z',
            totalDurationSeconds: 720,
            status: 'completed',
            steps: [
              { id: 'step-1', durationSeconds: 30, status: 'completed' },
              { id: 'step-2', durationSeconds: 690, status: 'completed' },
            ],
          },
          timelineEvents: [
            {
              sequence: 0,
              type: 'session_started',
              occurredAt: '2026-05-09T18:00:00.000Z',
              sessionElapsedSeconds: 0,
              sessionRunning: true,
              currentStepIndex: 0,
              stepId: 'step-1',
              stepStatus: 'pending',
              stepRunning: false,
              stepElapsedSeconds: 0,
              stepDurationSeconds: 30,
            },
            {
              sequence: 1,
              type: 'step_started',
              occurredAt: '2026-05-09T18:00:00.000Z',
              sessionElapsedSeconds: 0,
              sessionRunning: true,
              currentStepIndex: 0,
              stepId: 'step-1',
              stepStatus: 'pending',
              stepRunning: true,
              stepElapsedSeconds: 0,
              stepDurationSeconds: 30,
            },
            {
              sequence: 2,
              type: 'step_completed',
              occurredAt: '2026-05-09T18:00:30.000Z',
              sessionElapsedSeconds: 30,
              sessionRunning: true,
              currentStepIndex: 0,
              stepId: 'step-1',
              stepStatus: 'completed',
              stepRunning: false,
              stepElapsedSeconds: 30,
              stepDurationSeconds: 30,
            },
            {
              sequence: 3,
              type: 'session_finished',
              occurredAt: '2026-05-09T18:12:00.000Z',
              sessionElapsedSeconds: 720,
              sessionRunning: false,
              currentStepIndex: 1,
              stepId: 'step-2',
              stepStatus: 'completed',
              stepRunning: false,
              stepElapsedSeconds: 690,
              stepDurationSeconds: 690,
            },
          ],
        }),
      });
      assert.equal(stopResponse.status, 200);
      const stopped = await stopResponse.json() as {
        active: boolean;
        sessionId: string | null;
        recording: {
          status: string;
          sessionId: string | null;
          relativeFilePath: string | null;
          downloadPath: string | null;
          metadataRelativeFilePath: string | null;
          metadataDownloadPath: string | null;
          chapterCount: number | null;
          chaptersEmbedded: boolean | null;
        } | null;
      };
      assert.equal(stopped.active, false);
      assert.equal(stopped.sessionId, 'session-123');
      assert.equal(stopped.recording?.status, 'completed');
      assert.equal(stopped.recording?.relativeFilePath, '2026/05/09/2026-05-09 18-00-00 - max 12m.mp4');
      assert.equal(stopped.recording?.downloadPath, '/separation/api/recordings/file/2026/05/09/2026-05-09%2018-00-00%20-%20max%2012m.mp4');
      assert.equal(stopped.recording?.metadataRelativeFilePath, '2026/05/09/2026-05-09 18-00-00 - max 12m.brave-paws.json');
      assert.equal(stopped.recording?.metadataDownloadPath, '/separation/api/recordings/file/2026/05/09/2026-05-09%2018-00-00%20-%20max%2012m.brave-paws.json');
      assert.equal(stopped.recording?.chapterCount, 2);
      assert.equal(stopped.recording?.chaptersEmbedded, false);

      const servedRecording = await fetch(`${baseUrl}${stopped.recording?.downloadPath}`);
      assert.equal(servedRecording.status, 200);
      assert.equal(await servedRecording.text(), 'fake recording payload');

      const storedRecordingPath = path.join(config.recordingsDir, '2026/05/09/2026-05-09 18-00-00 - max 12m.mp4');
      assert.equal(await fs.readFile(storedRecordingPath, 'utf8'), 'fake recording payload');

      const storedMetadataPath = path.join(config.recordingsDir, '2026/05/09/2026-05-09 18-00-00 - max 12m.brave-paws.json');
      const sidecar = JSON.parse(await fs.readFile(storedMetadataPath, 'utf8')) as {
        version: number;
        recordingFile: { metadataRelativePath: string; relativePath: string };
        recording: { chapterCount: number; chaptersEmbedded: boolean };
        timeline: { eventCount: number };
        chapters: Array<{ title: string }>;
      };
      assert.equal(sidecar.version, 1);
      assert.equal(sidecar.recordingFile.relativePath, '2026/05/09/2026-05-09 18-00-00 - max 12m.mp4');
      assert.equal(sidecar.recordingFile.metadataRelativePath, '2026/05/09/2026-05-09 18-00-00 - max 12m.brave-paws.json');
      assert.equal(sidecar.recording.chapterCount, 2);
      assert.equal(sidecar.recording.chaptersEmbedded, false);
      assert.equal(sidecar.timeline.eventCount, 4);
      assert.deepEqual(sidecar.chapters.map((chapter) => chapter.title), ['Step 1 · 30s', 'Step 1 · 30s completed']);
    }, {
      recordingProvider: 'command',
      recordingsDir: recordingDir,
      recordingStatusCommand: `python3 - <<'PY'\nimport json, os\nstate_file = ${JSON.stringify(stateFilePath)}\nif not os.path.exists(state_file):\n    print(json.dumps({"active": False, "sessionId": None, "recording": None}))\nelse:\n    print(open(state_file, 'r', encoding='utf8').read())\nPY`,
      recordingStartCommand: `python3 - <<'PY'\nimport json, os\nstate_file = ${JSON.stringify(stateFilePath)}\npayload = {"active": True, "sessionId": os.environ.get("BRAVE_PAWS_RECORDING_SESSION_ID"), "recording": {"status": "recording", "sessionId": os.environ.get("BRAVE_PAWS_RECORDING_SESSION_ID"), "startedAt": "2026-05-09T18:00:00.000Z", "hasAudio": True}}\nos.makedirs(os.path.dirname(state_file), exist_ok=True)\nopen(state_file, 'w', encoding='utf8').write(json.dumps(payload))\nprint(json.dumps(payload))\nPY`,
      recordingStopCommand: `python3 - <<'PY'\nimport json, os\nstate_file = ${JSON.stringify(stateFilePath)}\npayload = {"active": False, "sessionId": os.environ.get("BRAVE_PAWS_RECORDING_SESSION_ID"), "recording": {"status": "completed", "sessionId": os.environ.get("BRAVE_PAWS_RECORDING_SESSION_ID"), "startedAt": "2026-05-09T18:00:00.000Z", "stoppedAt": "2026-05-09T18:12:00.000Z", "hasAudio": True, "relativeFilePath": "2026/05/09/session-123.mp4", "durationSeconds": 720, "sizeBytes": 19}}\nos.makedirs(os.path.dirname(state_file), exist_ok=True)\nopen(state_file, 'w', encoding='utf8').write(json.dumps(payload))\nprint(json.dumps(payload))\nPY`,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('session recording stop replays a cached completed result for the same session id', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-recording-stop-cache-'));
  const stopCountFilePath = path.join(tempDir, 'stop-count.txt');
  const recordingDir = path.join(tempDir, 'recordings');

  try {
    await withFixtureServer(async ({ baseUrl }) => {
      const recordingSourcePath = path.join(recordingDir, '2026/05/09/session-123.mp4');
      await fs.mkdir(path.dirname(recordingSourcePath), { recursive: true });
      await fs.writeFile(recordingSourcePath, 'fake recording payload');

      const payload = {
        sessionId: 'session-123',
        disposition: 'save',
        sessionSnapshot: {
          id: 'session-123',
          date: '2026-05-09T18:00:00.000Z',
          totalDurationSeconds: 720,
          status: 'completed' as const,
          steps: [
            { id: 'step-1', durationSeconds: 30, status: 'completed' as const },
            { id: 'step-2', durationSeconds: 690, status: 'completed' as const },
          ],
        },
      };

      const firstResponse = await fetch(`${baseUrl}/separation/api/recording/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(firstResponse.status, 200);

      const secondResponse = await fetch(`${baseUrl}/separation/api/recording/stop`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(secondResponse.status, 200);

      const secondBody = await secondResponse.json() as {
        sessionId: string | null;
        recording: { relativeFilePath: string | null } | null;
      };
      assert.equal(secondBody.sessionId, 'session-123');
      assert.equal(secondBody.recording?.relativeFilePath, '2026/05/09/2026-05-09 18-00-00 - max 12m.mp4');
      assert.equal((await fs.readFile(stopCountFilePath, 'utf8')).trim(), '1');
    }, {
      recordingProvider: 'command',
      recordingsDir: recordingDir,
      recordingStatusCommand: `python3 - <<'PY'\nimport json\nprint(json.dumps({"active": False, "sessionId": None, "recording": None}))\nPY`,
      recordingStartCommand: `python3 - <<'PY'\nimport json\nprint(json.dumps({"active": True, "sessionId": "session-123", "recording": {"status": "recording", "sessionId": "session-123", "provider": "command"}}))\nPY`,
      recordingStopCommand: `python3 - <<'PY'\nimport json, os\ncount_file = ${JSON.stringify(stopCountFilePath)}\ncount = 0\nif os.path.exists(count_file):\n    count = int(open(count_file, 'r', encoding='utf8').read().strip() or '0')\ncount += 1\nos.makedirs(os.path.dirname(count_file), exist_ok=True)\nopen(count_file, 'w', encoding='utf8').write(str(count))\npayload = {"active": False, "sessionId": os.environ.get("BRAVE_PAWS_RECORDING_SESSION_ID"), "recording": {"status": "completed", "sessionId": os.environ.get("BRAVE_PAWS_RECORDING_SESSION_ID"), "startedAt": "2026-05-09T18:00:00.000Z", "stoppedAt": "2026-05-09T18:12:00.000Z", "hasAudio": True, "relativeFilePath": "2026/05/09/session-123.mp4", "durationSeconds": 720, "sizeBytes": 19}}\nprint(json.dumps(payload))\nPY`,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('recording download rejects malformed path segments instead of crashing', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await requestRaw(baseUrl, '/separation/api/recordings/file/%E0%A4%A');
    assert.equal(response.statusCode, 400);
    assert.match(response.body, /Invalid recording path/);
  });
});

test('recording stop rejects oversized JSON payloads', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const oversizedTimelineEvent = {
      sequence: 0,
      type: 'session_started',
      occurredAt: '2026-05-09T18:00:00.000Z',
      sessionElapsedSeconds: 0,
      sessionRunning: true,
      currentStepIndex: 0,
      stepId: 'step-1',
      stepStatus: 'pending',
      stepRunning: false,
      stepElapsedSeconds: 0,
      stepDurationSeconds: 30,
      note: 'x'.repeat(600_000),
    };

    const response = await fetch(`${baseUrl}/separation/api/recording/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-123',
        disposition: 'discard',
        timelineEvents: [oversizedTimelineEvent],
      }),
    });

    assert.equal(response.status, 413);
    assert.match(await response.text(), /maximum size of 512KB/i);
  });
});

test('recording download requires auth when an auth token is configured', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-recording-auth-'));
  const recordingDir = path.join(tempDir, 'recordings');
  const relativeRecordingPath = '2026/05/09/secure-session.mp4';

  try {
    await fs.mkdir(path.join(recordingDir, '2026/05/09'), { recursive: true });
    await fs.writeFile(path.join(recordingDir, relativeRecordingPath), 'secure recording payload');

    await withFixtureServer(async ({ baseUrl }) => {
      const unauthenticated = await requestRaw(baseUrl, `/separation/api/recordings/file/${relativeRecordingPath}`);
      assert.equal(unauthenticated.statusCode, 401);

      const authenticated = await requestRaw(baseUrl, `/separation/api/recordings/file/${relativeRecordingPath}`, {
        'x-brave-paws-token': 'secret-token',
      });
      assert.equal(authenticated.statusCode, 200);
      assert.equal(authenticated.body, 'secure recording payload');
    }, {
      authToken: 'secret-token',
      recordingsDir: recordingDir,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('camera streaming capability can be toggled through the command provider', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-camera-control-'));
  const stateFilePath = path.join(tempDir, 'camera-state.txt');
  await fs.writeFile(stateFilePath, 'off\n');

  try {
    await withFixtureServer(async ({ baseUrl }) => {
      const before = await fetch(`${baseUrl}/separation/api/capabilities/camera-streaming`);
      assert.equal(before.status, 200);
      assert.equal((await before.json() as { enabled: boolean | null }).enabled, false);

      const enableResponse = await fetch(`${baseUrl}/separation/api/capabilities/camera-streaming`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      assert.equal(enableResponse.status, 200);
      assert.equal((await enableResponse.json() as { enabled: boolean | null }).enabled, true);
      assert.equal((await fs.readFile(stateFilePath, 'utf8')).trim(), 'on');

      const disableResponse = await fetch(`${baseUrl}/separation/api/capabilities/camera-streaming`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      assert.equal(disableResponse.status, 200);
      assert.equal((await disableResponse.json() as { enabled: boolean | null }).enabled, false);
      assert.equal((await fs.readFile(stateFilePath, 'utf8')).trim(), 'off');
    }, {
      cameraControlProvider: 'command',
      cameraControlStatusCommand: `cat ${JSON.stringify(stateFilePath)}`,
      cameraControlEnableCommand: `printf 'on\n' > ${JSON.stringify(stateFilePath)}`,
      cameraControlDisableCommand: `printf 'off\n' > ${JSON.stringify(stateFilePath)}`,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('camera command misconfiguration stays visible through the capability payload', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/capabilities/camera-streaming`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      provider: string;
      supported: boolean;
      canSetEnabled: boolean;
      detail: string | null;
    };

    assert.equal(body.provider, 'command');
    assert.equal(body.supported, false);
    assert.equal(body.canSetEnabled, false);
    assert.match(body.detail || '', /missing status, disable commands/i);
  }, {
    cameraControlProvider: 'command',
    cameraControlEnableCommand: 'printf on\\n',
  });
});

test('camera command failures return a structured capability payload without leaking command details', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-camera-control-failure-'));
  const stateFilePath = path.join(tempDir, 'camera-state.txt');
  await fs.writeFile(stateFilePath, 'off\n');

  try {
    await withFixtureServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/separation/api/capabilities/camera-streaming`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });

      assert.equal(response.status, 200);
      const body = await response.json() as {
        provider: string;
        supported: boolean;
        enabled: boolean | null;
        detail: string | null;
      };

      assert.equal(body.provider, 'command');
      assert.equal(body.supported, true);
      assert.equal(body.enabled, false);
      assert.equal(body.detail, 'Unable to turn camera streaming on right now.');
      assert.doesNotMatch(JSON.stringify(body), /secret-path|camera-state\.txt|totally-broken-command/);
    }, {
      cameraControlProvider: 'command',
      cameraControlStatusCommand: `cat ${JSON.stringify(stateFilePath)}`,
      cameraControlEnableCommand: 'printf "secret-path\n" >&2; totally-broken-command',
      cameraControlDisableCommand: `printf 'off\n' > ${JSON.stringify(stateFilePath)}`,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('sync push and pull round-trip sessions to disk', async () => {
  await withFixtureServer(async ({ baseUrl, config }) => {
    const sessions = [{ 
      id: 'session-1',
      date: '2026-05-03T11:00:00.000Z',
      steps: [{ id: 'step-1', durationSeconds: 30, status: 'completed' }],
      totalDurationSeconds: 30,
      status: 'completed',
    }];

    const pushResponse = await fetch(`${baseUrl}/separation/api/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessions }),
    });
    assert.equal(pushResponse.status, 200);

    const pullResponse = await fetch(`${baseUrl}/separation/api/sync/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const payload = await pullResponse.json() as { sessions: Array<{ id: string }> };
    assert.equal(payload.sessions.length, 1);
    assert.equal(payload.sessions[0]?.id, 'session-1');

    const stored = JSON.parse(await fs.readFile(config.dataFilePath, 'utf8')) as { sessions: Array<{ id: string }> };
    assert.equal(stored.sessions[0]?.id, 'session-1');

    const csvFilePath = getSessionsCsvFilePath(config.dataFilePath);
    const csv = await fs.readFile(csvFilePath, 'utf8');
    assert.match(csv, /Session Status/);
    assert.match(csv, /2026-05-03/);
  });
});

test('session CRUD endpoints expose individual sessions', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const session = {
      id: 'session-2',
      date: '2026-05-03T11:30:00.000Z',
      steps: [{ id: 'step-1', durationSeconds: 45, status: 'pending' }],
      totalDurationSeconds: 0,
      status: 'pending',
    };

    const createResponse = await fetch(`${baseUrl}/separation/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(session),
    });
    assert.equal(createResponse.status, 201);

    const getResponse = await fetch(`${baseUrl}/separation/api/sessions/session-2`);
    assert.equal(getResponse.status, 200);
    const fetched = await getResponse.json() as { id: string };
    assert.equal(fetched.id, 'session-2');
  });
});

test('camera proxy forwards manifest and asset requests to the configured upstream', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/camera/live.stream/index.m3u8`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'camera:/live.stream/index.m3u8');
  });
});

test('camera preview path serves the Brave Paws compatibility player page', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/camera/live.stream/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    const html = await response.text();
    assert.match(html, /Brave Paws Picam Preview/);
    assert.match(html, /video1_stream\.m3u8/);
    assert.match(html, /hls\.min\.js/);
  });
});

test('camera proxy normalizes directory-style stream paths without a trailing slash', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/camera/live.stream`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Brave Paws Picam Preview/);
  });
});

test('camera proxy rejects absolute URLs in the request suffix', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/camera/http://evil.example/live.stream/index.m3u8`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Invalid camera path',
    });
  });
});

test('imports newer CSV drops into the canonical session store on read', async () => {
  await withFixtureServer(async ({ baseUrl, config }) => {
    const csvFilePath = getSessionsCsvFilePath(config.dataFilePath);
    await fs.mkdir(path.dirname(csvFilePath), { recursive: true });
    await fs.writeFile(csvFilePath, [
      'Date,Session Status,Total Duration (s),Max Step Duration (s),Completed Steps,Aborted Steps,Total Steps,Anxiety Score,Notes,Exercised Level,Anyone Home,Step 1 Duration (s),Step 1 Status',
      '2026-05-02 08:00:00,completed,30,30,1,0,1,Calm,"CSV import",2,,30,completed',
    ].join('\n'));

    const response = await fetch(`${baseUrl}/separation/api/sync/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(response.status, 200);

    const payload = await response.json() as { sessions: Array<{ notes?: string }> };
    assert.equal(payload.sessions.length, 1);
    assert.equal(payload.sessions[0]?.notes, 'CSV import');

    const stored = JSON.parse(await fs.readFile(config.dataFilePath, 'utf8')) as { sessions: Array<{ notes?: string }> };
    assert.equal(stored.sessions[0]?.notes, 'CSV import');
  });
});

test('client diagnostics endpoint appends sanitized frontend events to disk', async () => {
  await withFixtureServer(async ({ baseUrl, config }) => {
    const response = await fetch(`${baseUrl}${config.clientDiagnosticsPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: 'quantum_sync_error',
        severity: 'error',
        message: 'Sync exploded',
        fingerprint: 'quantum-sync:error',
        pageUrl: 'https://brave-paws.example/separation/app/',
        details: {
          stage: 'push',
          nested: {
            reason: 'timeout',
          },
        },
      }),
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { status: 'accepted' });

    const diagnosticsFilePath = path.join(config.dataDir, 'client_diagnostics.jsonl');
    const raw = await fs.readFile(diagnosticsFilePath, 'utf8');
    const record = JSON.parse(raw.trim()) as {
      category: string;
      severity: string;
      message: string;
      fingerprint: string;
      pageUrl: string;
      details: { stage: string; nested: { reason: string } };
    };

    assert.equal(record.category, 'quantum_sync_error');
    assert.equal(record.severity, 'error');
    assert.equal(record.message, 'Sync exploded');
    assert.equal(record.fingerprint, 'quantum-sync:error');
    assert.equal(record.pageUrl, 'https://brave-paws.example/separation/app/');
    assert.equal(record.details.stage, 'push');
    assert.equal(record.details.nested.reason, 'timeout');
  });
});

test('camera streaming control requires auth when a token is configured', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-camera-auth-'));
  const stateFilePath = path.join(tempDir, 'camera-state.txt');
  await fs.writeFile(stateFilePath, 'off\n');

  try {
    await withFixtureServer(async ({ baseUrl }) => {
      const unauthorized = await fetch(`${baseUrl}/separation/api/capabilities/camera-streaming`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      assert.equal(unauthorized.status, 401);

      const authorized = await fetch(`${baseUrl}/separation/api/capabilities/camera-streaming`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-brave-paws-token': 'secret-token',
        },
        body: JSON.stringify({ enabled: true }),
      });
      assert.equal(authorized.status, 200);
      assert.equal((await authorized.json() as { enabled: boolean | null }).enabled, true);
    }, {
      authToken: 'secret-token',
      cameraControlProvider: 'command',
      cameraControlStatusCommand: `cat ${JSON.stringify(stateFilePath)}`,
      cameraControlEnableCommand: `printf 'on\n' > ${JSON.stringify(stateFilePath)}`,
      cameraControlDisableCommand: `printf 'off\n' > ${JSON.stringify(stateFilePath)}`,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('client diagnostics endpoint requires auth when a token is configured', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-server-auth-'));
  const landingDir = path.join(tempDir, 'landing');
  const appDir = path.join(tempDir, 'app');
  const dataDir = path.join(tempDir, 'data');
  await fs.mkdir(landingDir, { recursive: true });
  await fs.mkdir(appDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(landingDir, 'index.html'), '<html><body>landing</body></html>');
  await fs.writeFile(path.join(appDir, 'index.html'), '<html><body>app</body></html>');

  const upstream = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`camera:${request.url}`);
  });
  const upstreamBaseUrl = await listen(upstream);

  const config: BravePawsServerConfig = {
    host: '127.0.0.1',
    port: 0,
    publicBaseUrl: null,
    landingBasePath: '/separation/',
    appBasePath: '/separation/app/',
    apiBasePath: '/separation/api/',
    cameraBasePath: '/separation/camera/',
    healthPath: '/separation/api/health',
    clientDiagnosticsPath: '/separation/api/client-diagnostics',
    landingDistDir: landingDir,
    appDistDir: appDir,
    dataDir,
    dataFilePath: path.join(dataDir, 'sessions.json'),
    pairingStoreFilePath: path.join(dataDir, 'pairings.json'),
    pairingEnabled: false,
    cameraUpstreamBaseUrl: `${upstreamBaseUrl}/`,
    cameraControlProvider: 'none',
    cameraControlLabel: 'Camera streaming',
    cameraControlStatusCommand: null,
    cameraControlEnableCommand: null,
    cameraControlDisableCommand: null,
    recordingProvider: 'none',
    recordingLabel: 'Session recording',
    recordingStatusCommand: null,
    recordingStartCommand: null,
    recordingStopCommand: null,
    authToken: 'secret-token',
    corsAllowedOrigins: [],
    recordingsDir: path.join(dataDir, 'recordings'),
  };

  const server = createBravePawsServer(config);
  const baseUrl = await listen(server);

  try {
    const unauthorized = await fetch(`${baseUrl}${config.clientDiagnosticsPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'nope' }),
    });
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${baseUrl}${config.clientDiagnosticsPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-brave-paws-token': 'secret-token',
      },
      body: JSON.stringify({ category: 'frontend_error', severity: 'warn', message: 'allowed' }),
    });
    assert.equal(authorized.status, 202);
  } finally {
    await close(server);
    await close(upstream);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('pairing broker is disabled by default for public-safety', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/pairings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cameraUrl: 'https://private.example/live.stream' }),
    });

    assert.equal(response.status, 404);
  });
});

test('pairing broker requires BRAVE_PAWS_AUTH_TOKEN for HTTP pairing creation', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/pairings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cameraUrl: 'https://private.example/live.stream' }),
    });

    assert.equal(response.status, 503);
    assert.match(await response.text(), /BRAVE_PAWS_AUTH_TOKEN/);
  }, {
    pairingEnabled: true,
  });
});

test('pairing broker returns 400 for malformed JSON bodies', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/pairings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-brave-paws-token': 'secret-token',
      },
      body: '{"cameraUrl":',
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /Could not create pairing|JSON|Unexpected/i);
  }, {
    pairingEnabled: true,
    authToken: 'secret-token',
  });
});

test('pairing broker only returns absolute pairing URLs from BRAVE_PAWS_PUBLIC_BASE_URL', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/separation/api/pairings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-brave-paws-token': 'secret-token',
        host: 'evil.example',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({ cameraUrl: 'https://private.example/live.stream' }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json() as { pairingUrl: string | null };
    assert.equal(payload.pairingUrl, null);
  }, {
    pairingEnabled: true,
    authToken: 'secret-token',
  });
});

test('pairing broker creates one-time pairing URLs and consumes them once', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-server-pairings-'));
  const landingDir = path.join(tempDir, 'landing');
  const appDir = path.join(tempDir, 'app');
  const dataDir = path.join(tempDir, 'data');
  await fs.mkdir(landingDir, { recursive: true });
  await fs.mkdir(appDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(landingDir, 'index.html'), '<html><body>landing</body></html>');
  await fs.writeFile(path.join(appDir, 'index.html'), '<html><body>app</body></html>');

  const upstream = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`camera:${request.url}`);
  });
  const upstreamBaseUrl = await listen(upstream);

  const config: BravePawsServerConfig = {
    host: '127.0.0.1',
    port: 0,
    publicBaseUrl: 'https://brave-paws.example/',
    landingBasePath: '/separation/',
    appBasePath: '/separation/app/',
    apiBasePath: '/separation/api/',
    cameraBasePath: '/separation/camera/',
    healthPath: '/separation/api/health',
    clientDiagnosticsPath: '/separation/api/client-diagnostics',
    landingDistDir: landingDir,
    appDistDir: appDir,
    dataDir,
    dataFilePath: path.join(dataDir, 'sessions.json'),
    pairingStoreFilePath: path.join(dataDir, 'pairings.json'),
    pairingEnabled: true,
    cameraUpstreamBaseUrl: `${upstreamBaseUrl}/`,
    cameraControlProvider: 'none',
    cameraControlLabel: 'Camera streaming',
    cameraControlStatusCommand: null,
    cameraControlEnableCommand: null,
    cameraControlDisableCommand: null,
    recordingProvider: 'none',
    recordingLabel: 'Session recording',
    recordingStatusCommand: null,
    recordingStartCommand: null,
    recordingStopCommand: null,
    authToken: 'secret-token',
    corsAllowedOrigins: [],
    recordingsDir: path.join(dataDir, 'recordings'),
  };

  const server = createBravePawsServer(config);
  const baseUrl = await listen(server);

  try {
    const created = await fetch(`${baseUrl}/separation/api/pairings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-brave-paws-token': 'secret-token',
      },
      body: JSON.stringify({
        cameraUrl: 'https://private.example/live.stream/',
        profile: 'remote-low-latency',
        mode: 'mse,mp4,mjpeg',
      }),
    });
    assert.equal(created.status, 201);

    const createdPayload = await created.json() as { token: string; pairingUrl: string; expiresAt: string | null };
    assert.match(createdPayload.token, /^[A-Za-z0-9_-]{10,}$/);
    assert.equal(createdPayload.pairingUrl, `https://brave-paws.example/separation/app/?pairingToken=${createdPayload.token}`);
    assert.ok(createdPayload.expiresAt);

    const consumeResponse = await fetch(`${baseUrl}/separation/api/pairings/${createdPayload.token}`);
    assert.equal(consumeResponse.status, 200);
    const consumePayload = await consumeResponse.json() as { cameraUrl: string; consumedAt: string | null };
    assert.equal(consumePayload.cameraUrl, 'https://private.example/live.stream');
    assert.ok(consumePayload.consumedAt);

    const secondConsume = await fetch(`${baseUrl}/separation/api/pairings/${createdPayload.token}`);
    assert.equal(secondConsume.status, 404);
  } finally {
    await close(server);
    await close(upstream);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('malformed pairing tokens do not trigger a server error or stack leak', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const response = await requestRaw(baseUrl, '/separation/api/pairings/%ZZ');
    assert.equal(response.statusCode, 404);
    assert.match(response.body, /Pairing token not found or expired/);
    assert.doesNotMatch(response.body, /TypeError|at createBravePawsServer/);
  }, {
    pairingEnabled: true,
    authToken: 'secret-token',
  });
});

test('serves landing and app static files from the configured paths', async () => {
  await withFixtureServer(async ({ baseUrl }) => {
    const landingResponse = await fetch(`${baseUrl}/separation/`);
    assert.equal(landingResponse.status, 200);
    assert.match(await landingResponse.text(), /landing/);

    const appResponse = await fetch(`${baseUrl}/separation/app/`);
    assert.equal(appResponse.status, 200);
    assert.match(await appResponse.text(), /app/);
  });
});
