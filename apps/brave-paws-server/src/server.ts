import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { resolveConfig, type BravePawsServerConfig } from './config.js';
import {
  buildPairingAppUrl,
  consumePairing,
  createPairing,
  PAIRING_TOKEN_QUERY_PARAM,
} from './pairings.js';
import {
  appendClientDiagnostic,
  readSessionStore,
  upsertSession,
  writeSessionStore,
} from './storage.js';
import type { Session } from './types.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendText(response: ServerResponse, statusCode: number, body: string, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  response.end(body);
}

function notFound(response: ServerResponse, message = 'Not found') {
  sendJson(response, 404, {
    error: message,
  });
}

function trimString(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return trimString(value, 500);
  }

  if (depth >= 4) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeJsonValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, entry]) => [trimString(key, 80), sanitizeJsonValue(entry, depth + 1)]),
    );
  }

  return trimString(String(value), 500);
}

function sanitizeClientDiagnosticPayload(payload: unknown, request: IncomingMessage) {
  const candidate = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const category = typeof candidate.category === 'string' ? trimString(candidate.category, 80) : 'frontend_error';
  const severity = candidate.severity === 'info' || candidate.severity === 'warn' || candidate.severity === 'error'
    ? candidate.severity
    : 'error';
  const message = typeof candidate.message === 'string' ? trimString(candidate.message, 500) : 'Client diagnostic';
  const fingerprint = typeof candidate.fingerprint === 'string' ? trimString(candidate.fingerprint, 200) : `${category}:${message}`;
  const occurredAt = typeof candidate.occurredAt === 'string' ? trimString(candidate.occurredAt, 80) : null;
  const pageUrl = typeof candidate.pageUrl === 'string' ? trimString(candidate.pageUrl, 300) : null;
  const userAgent = typeof candidate.userAgent === 'string' ? trimString(candidate.userAgent, 300) : null;

  return {
    receivedAt: new Date().toISOString(),
    remoteAddress: request.socket.remoteAddress || null,
    category,
    severity,
    message,
    fingerprint,
    occurredAt,
    pageUrl,
    userAgent,
    details: sanitizeJsonValue(candidate.details ?? {}),
  };
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) as T : ({} as T);
}

function isWriteAuthorized(request: IncomingMessage, config: BravePawsServerConfig): boolean {
  if (!config.authToken) {
    return true;
  }

  const headerToken = request.headers['x-brave-paws-token'];
  return headerToken === config.authToken;
}

function getRequestOrigin(config: BravePawsServerConfig): string | null {
  return config.publicBaseUrl;
}

function getMimeType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function serveStaticFile(response: ServerResponse, filePath: string) {
  const stream = createReadStream(filePath);
  response.writeHead(200, {
    'content-type': getMimeType(filePath),
    'cache-control': filePath.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  });
  stream.pipe(response);
}

async function serveStaticSite(
  requestPathname: string,
  response: ServerResponse,
  options: { basePath: string; distDir: string; fallbackToIndex: boolean },
) {
  const relativePath = requestPathname.slice(options.basePath.length);
  const safeSegments = relativePath
    .split('/')
    .filter(Boolean)
    .filter((segment) => segment !== '.' && segment !== '..');
  let candidatePath = path.join(options.distDir, ...safeSegments);

  if (!safeSegments.length) {
    candidatePath = path.join(options.distDir, 'index.html');
  }

  if (await fileExists(candidatePath)) {
    const stats = await fs.stat(candidatePath);
    if (stats.isDirectory()) {
      const directoryIndex = path.join(candidatePath, 'index.html');
      if (await fileExists(directoryIndex)) {
        return serveStaticFile(response, directoryIndex);
      }
    } else {
      return serveStaticFile(response, candidatePath);
    }
  }

  if (options.fallbackToIndex) {
    const indexPath = path.join(options.distDir, 'index.html');
    if (await fileExists(indexPath)) {
      return serveStaticFile(response, indexPath);
    }
  }

  notFound(response);
}

function isCameraPreviewPath(pathname: string, config: BravePawsServerConfig): boolean {
  return pathname === `${config.cameraBasePath}live.stream/`;
}

function buildCameraPreviewHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Brave Paws Picam Preview</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #0f172a;
      overflow: hidden;
      font-family: system-ui, sans-serif;
    }

    video {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #0f172a;
    }

    #status {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      color: #e2e8f0;
      font-size: 0.95rem;
      text-align: center;
      pointer-events: none;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
      background: rgba(15, 23, 42, 0.25);
    }

    body.ready #status {
      display: none;
    }
  </style>
</head>
<body>
  <video id="video" muted autoplay playsinline></video>
  <div id="status">Connecting to picam…</div>

  <script src="hls.min.js"></script>
  <script>
    const MANIFEST_URL = 'video1_stream.m3u8' + window.location.search;
    const video = document.getElementById('video');
    const statusEl = document.getElementById('status');
    let hls = null;
    let lastAdvanceAt = Date.now();
    let lastTime = 0;

    function setStatus(message) {
      statusEl.textContent = message;
      document.body.classList.remove('ready');
    }

    function markReady() {
      document.body.classList.add('ready');
    }

    function destroyPlayer() {
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.removeAttribute('src');
      video.load();
    }

    function startPlayer() {
      destroyPlayer();
      setStatus('Connecting to picam…');

      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: false,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 8,
          maxLiveSyncPlaybackRate: 1.2,
          manifestLoadingMaxRetry: 6,
          levelLoadingMaxRetry: 6,
          fragLoadingMaxRetry: 6,
          backBufferLength: 30,
        });

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          hls.loadSource(MANIFEST_URL);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          markReady();
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data || !data.fatal) {
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setStatus('Reconnecting to picam…');
            try {
              hls.startLoad();
            } catch {
              window.setTimeout(startPlayer, 1000);
            }
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setStatus('Recovering video…');
            try {
              hls.recoverMediaError();
            } catch {
              window.setTimeout(startPlayer, 1000);
            }
            return;
          }

          setStatus('Restarting preview…');
          window.setTimeout(startPlayer, 1000);
        });

        hls.attachMedia(video);
        return;
      }

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = MANIFEST_URL;
        video.addEventListener('loadeddata', markReady, { once: true });
        video.play().catch(() => {});
        return;
      }

      setStatus('This browser cannot play the picam preview.');
    }

    video.addEventListener('playing', () => {
      lastAdvanceAt = Date.now();
      lastTime = video.currentTime;
      markReady();
    });

    video.addEventListener('timeupdate', () => {
      if (video.currentTime > lastTime + 0.05) {
        lastTime = video.currentTime;
        lastAdvanceAt = Date.now();
        markReady();
      }
    });

    window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      if (video.paused) {
        video.play().catch(() => {});
      }

      if (Date.now() - lastAdvanceAt > 4000) {
        setStatus('Preview stalled. Reconnecting…');
        startPlayer();
      }
    }, 2000);

    startPlayer();
  </script>
</body>
</html>`;
}

async function proxyCameraRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  config: BravePawsServerConfig,
) {
  if (request.method === 'GET' && isCameraPreviewPath(pathname, config)) {
    sendText(response, 200, buildCameraPreviewHtml(), 'text/html; charset=utf-8');
    return;
  }

  const suffix = pathname.slice(config.cameraBasePath.length);
  const targetUrl = new URL(suffix + (request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''), config.cameraUpstreamBaseUrl);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: {
        accept: request.headers.accept || '*/*',
        'user-agent': request.headers['user-agent'] || 'BravePawsServer/0.2',
      },
    });

    const headers = new Headers(upstreamResponse.headers);
    headers.delete('content-length');
    headers.delete('transfer-encoding');
    headers.set('cache-control', 'no-store');

    response.writeHead(upstreamResponse.status, Object.fromEntries(headers.entries()));

    if (!upstreamResponse.body) {
      response.end();
      return;
    }

    for await (const chunk of upstreamResponse.body) {
      response.write(chunk);
    }

    response.end();
  } catch (error) {
    sendJson(response, 502, {
      error: 'Camera upstream unavailable',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  config: BravePawsServerConfig,
) {
  if (pathname === config.healthPath) {
    const store = await readSessionStore(config.dataFilePath);
    sendJson(response, 200, {
      status: 'ok',
      publicBaseUrl: config.publicBaseUrl,
      appBasePath: config.appBasePath,
      apiBasePath: config.apiBasePath,
      cameraBasePath: config.cameraBasePath,
      clientDiagnosticsPath: config.clientDiagnosticsPath,
      pairingEnabled: config.pairingEnabled,
      pairingTokenQueryParam: PAIRING_TOKEN_QUERY_PARAM,
      sessionCount: store.sessions.length,
      updatedAt: store.updatedAt,
    });
    return;
  }

  const sessionsCollectionPath = `${config.apiBasePath}sessions`;
  const syncPullPath = `${config.apiBasePath}sync/pull`;
  const syncPushPath = `${config.apiBasePath}sync/push`;
  const clientDiagnosticsPath = config.clientDiagnosticsPath;
  const pairingCollectionPath = `${config.apiBasePath}pairings`;

  if (request.method === 'GET' && pathname === sessionsCollectionPath) {
    const store = await readSessionStore(config.dataFilePath);
    sendJson(response, 200, store);
    return;
  }

  if (request.method === 'POST' && pathname === sessionsCollectionPath) {
    if (!isWriteAuthorized(request, config)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    const payload = await readJsonBody<Session>(request);
    if (!payload?.id) {
      sendJson(response, 400, { error: 'Session id is required' });
      return;
    }

    const store = await upsertSession(config.dataFilePath, payload);
    sendJson(response, 201, store);
    return;
  }

  if (request.method === 'POST' && pathname === syncPullPath) {
    const store = await readSessionStore(config.dataFilePath);
    sendJson(response, 200, store);
    return;
  }

  if (request.method === 'POST' && pathname === syncPushPath) {
    if (!isWriteAuthorized(request, config)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    const payload = await readJsonBody<{ sessions?: Session[] }>(request);
    const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
    const store = await writeSessionStore(config.dataFilePath, sessions);
    sendJson(response, 200, store);
    return;
  }

  if (request.method === 'POST' && pathname === clientDiagnosticsPath) {
    if (!isWriteAuthorized(request, config)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    const payload = await readJsonBody(request);
    const record = sanitizeClientDiagnosticPayload(payload, request);
    await appendClientDiagnostic(config.dataFilePath, record);
    sendJson(response, 202, {
      status: 'accepted',
    });
    return;
  }

  if (pathname === pairingCollectionPath) {
    if (!config.pairingEnabled) {
      notFound(response);
      return;
    }

    if (request.method === 'POST') {
      if (!config.authToken) {
        sendJson(response, 503, {
          error: 'Pairing creation requires BRAVE_PAWS_AUTH_TOKEN to be configured',
        });
        return;
      }

      if (!isWriteAuthorized(request, config)) {
        sendJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      const payload = await readJsonBody<{ cameraUrl?: string; profile?: string; mode?: string; ttlHours?: number }>(request);

      try {
        const record = await createPairing(
          config.pairingStoreFilePath,
          {
            cameraUrl: payload.cameraUrl || '',
            profile:
              payload.profile === 'local-quality' || payload.profile === 'remote-low-latency'
                ? payload.profile
                : undefined,
            mode: payload.mode,
          },
          { ttlHours: payload.ttlHours },
        );
        const requestOrigin = getRequestOrigin(config);
        const pairingUrl = requestOrigin ? buildPairingAppUrl(requestOrigin, config.appBasePath, record.token) : null;

        sendJson(response, 201, {
          token: record.token,
          pairingUrl,
          expiresAt: record.expiresAt,
          profile: record.launchConfig.profile,
          mode: record.launchConfig.mode,
        });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : 'Could not create pairing',
        });
      }
      return;
    }
  }

  if (pathname.startsWith(`${pairingCollectionPath}/`)) {
    if (!config.pairingEnabled) {
      notFound(response);
      return;
    }

    if (request.method === 'GET') {
      const token = pathname.slice(`${pairingCollectionPath}/`.length);
      const record = await consumePairing(config.pairingStoreFilePath, token);

      if (!record) {
        notFound(response, 'Pairing token not found or expired');
        return;
      }

      sendJson(response, 200, {
        cameraUrl: record.launchConfig.cameraUrl,
        profile: record.launchConfig.profile,
        mode: record.launchConfig.mode,
        expiresAt: record.expiresAt,
        consumedAt: record.consumedAt,
      });
      return;
    }
  }

  if (pathname.startsWith(`${sessionsCollectionPath}/`)) {
    const sessionId = decodeURIComponent(pathname.slice(`${sessionsCollectionPath}/`.length));
    const store = await readSessionStore(config.dataFilePath);
    const session = store.sessions.find((entry) => entry.id === sessionId);

    if (request.method === 'GET') {
      if (!session) {
        notFound(response, 'Session not found');
        return;
      }

      sendJson(response, 200, session);
      return;
    }

    if (request.method === 'PUT') {
      if (!isWriteAuthorized(request, config)) {
        sendJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      const payload = await readJsonBody<Session>(request);
      const nextSession = {
        ...payload,
        id: sessionId,
      };
      const updatedStore = await upsertSession(config.dataFilePath, nextSession);
      sendJson(response, 200, updatedStore);
      return;
    }
  }

  notFound(response);
}

export function createBravePawsServer(config = resolveConfig()) {
  const server = http.createServer(async (request, response) => {
    try {
      if (!request.url) {
        notFound(response);
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host || `${config.host}:${config.port}`}`);
      const pathname = url.pathname;

      if (pathname === '/') {
        response.writeHead(302, { location: config.landingBasePath });
        response.end();
        return;
      }

      if (pathname === config.apiBasePath || pathname === config.apiBasePath.slice(0, -1)) {
        response.writeHead(302, { location: config.healthPath });
        response.end();
        return;
      }

      if (pathname === config.cameraBasePath || pathname === config.cameraBasePath.slice(0, -1)) {
        response.writeHead(302, { location: `${config.cameraBasePath}live.stream/` });
        response.end();
        return;
      }

      if (
        pathname.startsWith(config.cameraBasePath)
        && !pathname.endsWith('/')
        && (
          path.posix.basename(pathname) === 'live.stream'
          || !path.posix.basename(pathname).includes('.')
        )
      ) {
        response.writeHead(302, { location: `${pathname}/${url.search}` });
        response.end();
        return;
      }

      if (pathname.startsWith(config.apiBasePath)) {
        await handleApiRequest(request, response, pathname, config);
        return;
      }

      if (pathname.startsWith(config.cameraBasePath)) {
        await proxyCameraRequest(request, response, pathname, config);
        return;
      }

      if (pathname.startsWith(config.appBasePath)) {
        await serveStaticSite(pathname, response, {
          basePath: config.appBasePath,
          distDir: config.appDistDir,
          fallbackToIndex: true,
        });
        return;
      }

      if (pathname.startsWith(config.landingBasePath)) {
        await serveStaticSite(pathname, response, {
          basePath: config.landingBasePath,
          distDir: config.landingDistDir,
          fallbackToIndex: false,
        });
        return;
      }

      notFound(response);
    } catch (error) {
      if (error instanceof TypeError) {
        sendJson(response, 400, { error: 'Invalid request URL' });
        return;
      }

      console.error('Brave Paws server request failed', error);
      sendText(response, 500, 'Internal server error');
    }
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = resolveConfig();
  const server = createBravePawsServer(config);

  server.listen(config.port, config.host, () => {
    const publicHint = config.publicBaseUrl
      ? `${config.publicBaseUrl.replace(/\/+$/, '')}${config.landingBasePath}`
      : `http://${config.host}:${config.port}${config.landingBasePath}`;

    console.log(`Brave Paws server listening on http://${config.host}:${config.port}`);
    console.log(`Landing page: ${publicHint}`);
    console.log(`API health: http://${config.host}:${config.port}${config.healthPath}`);
    console.log(`Camera proxy: http://${config.host}:${config.port}${config.cameraBasePath}live.stream/`);
    console.log(`Session store: ${config.dataFilePath}`);
    if (config.pairingEnabled) {
      console.log(`Pairing broker: http://${config.host}:${config.port}${config.apiBasePath}pairings`);
      if (!config.authToken) {
        console.warn('Pairing creation over HTTP is disabled until BRAVE_PAWS_AUTH_TOKEN is configured.');
      }
      if (!config.publicBaseUrl) {
        console.warn('Pairing tokens can still be minted, but absolute pairing URLs require BRAVE_PAWS_PUBLIC_BASE_URL.');
      }
    }
  });
}
