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

async function requestRaw(baseUrl: string, requestPath: string) {
  const url = new URL(baseUrl);

  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: requestPath,
        method: 'GET',
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
    authToken: null,
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
    authToken: 'secret-token',
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
    authToken: 'secret-token',
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
