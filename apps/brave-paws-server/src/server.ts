import fs from 'node:fs/promises';
import { createReadStream, readFileSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { resolveConfig, type BravePawsServerConfig } from './config.js';
import {
  createCameraStreamingController,
  getBackendCapabilities,
  type CameraStreamingCapability,
  type CameraStreamingController,
} from './cameraControl.js';
import {
  createSessionRecordingController,
  type SessionRecordingCapability,
  type SessionRecordingController,
} from './recordingControl.js';
import { finalizeRecordingMetadata, normalizeTimelineEvents } from './recordingMetadata.js';
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

const { version: appVersion = 'dev' } = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { version?: string };

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const CORS_ALLOWED_METHODS = 'GET,POST,PUT,OPTIONS';
const CORS_ALLOWED_HEADERS = 'content-type,x-brave-paws-token';
const RECORDING_STOP_REQUEST_MAX_BYTES = 512 * 1024;
const RECORDING_ARTIFACT_FINALIZE_CONCURRENCY = 2;

function buildRecordingArtifactFingerprint(session: Session): string | null {
  if (session.recording?.status !== 'completed' || !session.recording.relativeFilePath) {
    return null;
  }

  return JSON.stringify({
    date: session.date,
    status: session.status,
    totalDurationSeconds: session.totalDurationSeconds,
    steps: session.steps.map((step) => ({
      durationSeconds: step.durationSeconds,
      actualDurationSeconds: step.actualDurationSeconds ?? null,
      status: step.status,
    })),
    recording: {
      status: session.recording.status,
      provider: session.recording.provider,
      sessionId: session.recording.sessionId,
      startedAt: session.recording.startedAt ?? null,
      stoppedAt: session.recording.stoppedAt ?? null,
      relativeFilePath: session.recording.relativeFilePath,
      durationSeconds: session.recording.durationSeconds ?? null,
      hasAudio: session.recording.hasAudio ?? false,
      metadataRelativeFilePath: session.recording.metadataRelativeFilePath ?? null,
      chapterCount: session.recording.chapterCount ?? null,
    },
  });
}

async function finalizeSessionRecordingArtifacts(config: BravePawsServerConfig, session: Session): Promise<Session> {
  if (!session.recording) {
    return session;
  }

  const finalizedRecording = await finalizeRecordingMetadata({
    config,
    recording: session.recording,
    sessionSnapshot: session,
  });

  if (finalizedRecording === session.recording) {
    return session;
  }

  return {
    ...session,
    recording: finalizedRecording,
  };
}

async function mapWithConcurrencyLimit<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!values.length) {
    return [];
  }

  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, values.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
    }
  }));

  return results;
}

async function finalizeSessionsRecordingArtifacts(
  config: BravePawsServerConfig,
  sessions: Session[],
  existingSessions: Session[] = [],
): Promise<Session[]> {
  const previousById = new Map(existingSessions.map((session) => [session.id, session]));

  return mapWithConcurrencyLimit(sessions, RECORDING_ARTIFACT_FINALIZE_CONCURRENCY, async (session) => {
    const nextFingerprint = buildRecordingArtifactFingerprint(session);
    if (!nextFingerprint) {
      return session;
    }

    const previousSession = previousById.get(session.id);
    const previousFingerprint = previousSession ? buildRecordingArtifactFingerprint(previousSession) : null;
    const needsRefresh = previousFingerprint !== nextFingerprint
      || !session.recording?.metadataRelativeFilePath
      || session.recording.chapterCount == null;

    return needsRefresh ? finalizeSessionRecordingArtifacts(config, session) : session;
  });
}

class JsonBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`JSON request body exceeds ${maxBytes} bytes`);
    this.name = 'JsonBodyTooLargeError';
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function appendVaryHeader(response: ServerResponse, value: string) {
  const existing = response.getHeader('vary');
  const entries = new Set(
    String(existing || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  entries.add(value);
  response.setHeader('vary', Array.from(entries).join(', '));
}

function getAllowedCorsOrigin(request: IncomingMessage, config: BravePawsServerConfig): string | null {
  const requestOrigin = request.headers.origin;
  if (typeof requestOrigin !== 'string' || !requestOrigin) {
    return null;
  }

  return config.corsAllowedOrigins.includes(requestOrigin) ? requestOrigin : null;
}

function applyCorsHeaders(response: ServerResponse, request: IncomingMessage, config: BravePawsServerConfig): boolean {
  const allowedOrigin = getAllowedCorsOrigin(request, config);
  if (!allowedOrigin) {
    return false;
  }

  response.setHeader('access-control-allow-origin', allowedOrigin);
  response.setHeader('access-control-allow-methods', CORS_ALLOWED_METHODS);
  response.setHeader('access-control-allow-headers', CORS_ALLOWED_HEADERS);
  appendVaryHeader(response, 'Origin');
  return true;
}

function handleApiPreflight(request: IncomingMessage, response: ServerResponse, config: BravePawsServerConfig): boolean {
  if (request.method !== 'OPTIONS') {
    return false;
  }

  const requestOrigin = typeof request.headers.origin === 'string' ? request.headers.origin : null;
  if (!requestOrigin) {
    response.writeHead(204, {
      'cache-control': 'no-store',
      'access-control-allow-methods': CORS_ALLOWED_METHODS,
      'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    });
    response.end();
    return true;
  }

  if (!applyCorsHeaders(response, request, config)) {
    response.writeHead(403, {
      'cache-control': 'no-store',
    });
    response.end();
    return true;
  }

  response.writeHead(204, {
    'cache-control': 'no-store',
  });
  response.end();
  return true;
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

async function readJsonBody<T>(request: IncomingMessage, options: { maxBytes?: number } = {}): Promise<T> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (options.maxBytes != null && totalBytes > options.maxBytes) {
      throw new JsonBodyTooLargeError(options.maxBytes);
    }
    chunks.push(buffer);
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
  if (filePath.endsWith('.mp4')) return 'video/mp4';
  if (filePath.endsWith('.mkv')) return 'video/x-matroska';
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
    const MANIFEST_URL = 'index.m3u8' + window.location.search;
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

function resolveCameraProxyTarget(
  pathname: string,
  requestUrl: string | undefined,
  config: BravePawsServerConfig,
): URL | null {
  const suffix = pathname.slice(config.cameraBasePath.length);
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(suffix) || suffix.startsWith('//')) {
    return null;
  }

  const queryIndex = requestUrl?.indexOf('?') ?? -1;
  const query = queryIndex >= 0 && requestUrl ? requestUrl.slice(queryIndex) : '';
  const upstreamBase = new URL(config.cameraUpstreamBaseUrl);
  const targetUrl = new URL(`${suffix}${query}`, upstreamBase);

  const basePathPrefix = upstreamBase.pathname.endsWith('/')
    ? upstreamBase.pathname
    : `${upstreamBase.pathname}/`;
  if (targetUrl.origin !== upstreamBase.origin || !targetUrl.pathname.startsWith(basePathPrefix)) {
    return null;
  }

  return targetUrl;
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

  const targetUrl = resolveCameraProxyTarget(pathname, request.url, config);
  if (!targetUrl) {
    sendJson(response, 400, {
      error: 'Invalid camera path',
    });
    return;
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: {
        accept: request.headers.accept || '*/*',
        'user-agent': request.headers['user-agent'] || 'BravePawsServer/0.2.2',
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

function buildRecordingDownloadPath(apiBasePath: string, relativeFilePath: string | null | undefined): string | null {
  if (!relativeFilePath) {
    return null;
  }

  return `${apiBasePath}recordings/file/${relativeFilePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

function attachRecordingDownloadPath(apiBasePath: string, capability: SessionRecordingCapability): SessionRecordingCapability {
  if (!capability.recording) {
    return capability;
  }

  return {
    ...capability,
    recording: {
      ...capability.recording,
      downloadPath: buildRecordingDownloadPath(apiBasePath, capability.recording.relativeFilePath),
      metadataDownloadPath: buildRecordingDownloadPath(apiBasePath, capability.recording.metadataRelativeFilePath),
    },
  };
}

async function serveRecordingFile(
  response: ServerResponse,
  pathname: string,
  config: BravePawsServerConfig,
) {
  const prefix = `${config.apiBasePath}recordings/file/`;
  const encodedSegments = pathname.slice(prefix.length).split('/').filter(Boolean);
  const decodedSegments: string[] = [];

  for (const segment of encodedSegments) {
    try {
      decodedSegments.push(decodeURIComponent(segment));
    } catch {
      sendJson(response, 400, {
        error: 'Invalid recording path',
      });
      return;
    }
  }

  const safeSegments = decodedSegments.filter((segment) => segment && segment !== '.' && segment !== '..' && !segment.includes('..'));
  if (safeSegments.length !== decodedSegments.length) {
    notFound(response);
    return;
  }

  const resolvedPath = path.resolve(config.recordingsDir, ...safeSegments);
  const relativeResolved = path.relative(config.recordingsDir, resolvedPath);
  if (relativeResolved.startsWith('..') || path.isAbsolute(relativeResolved)) {
    notFound(response);
    return;
  }

  if (!(await fileExists(resolvedPath))) {
    notFound(response, 'Recording not found');
    return;
  }

  await serveStaticFile(response, resolvedPath);
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  config: BravePawsServerConfig,
  cameraStreamingController: CameraStreamingController,
  sessionRecordingController: SessionRecordingController,
) {
  const capabilitiesPath = `${config.apiBasePath}capabilities`;
  const cameraStreamingCapabilityPath = `${capabilitiesPath}/camera-streaming`;
  const sessionRecordingCapabilityPath = `${capabilitiesPath}/recording`;

  if (pathname === config.healthPath) {
    const store = await readSessionStore(config.dataFilePath);
    sendJson(response, 200, {
      status: 'ok',
      service: 'brave-paws-server',
      version: appVersion,
      writeAuthRequired: Boolean(config.authToken),
      publicBaseUrl: config.publicBaseUrl,
      appBasePath: config.appBasePath,
      apiBasePath: config.apiBasePath,
      cameraBasePath: config.cameraBasePath,
      clientDiagnosticsPath: config.clientDiagnosticsPath,
      capabilitiesPath,
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
  const recordingStartPath = `${config.apiBasePath}recording/start`;
  const recordingStopPath = `${config.apiBasePath}recording/stop`;
  const recordingFilePathPrefix = `${config.apiBasePath}recordings/file/`;

  if (request.method === 'GET' && pathname === capabilitiesPath) {
    const capabilities = await getBackendCapabilities(cameraStreamingController);
    sendJson(response, 200, {
      ...capabilities,
      sessionRecording: attachRecordingDownloadPath(config.apiBasePath, await sessionRecordingController.getCapability()),
    });
    return;
  }

  if (pathname === cameraStreamingCapabilityPath) {
    if (request.method === 'GET') {
      sendJson(response, 200, await cameraStreamingController.getCapability());
      return;
    }

    if (request.method === 'POST') {
      if (!isWriteAuthorized(request, config)) {
        sendJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      const payload = await readJsonBody<{ enabled?: boolean }>(request);
      if (typeof payload.enabled !== 'boolean') {
        sendJson(response, 400, { error: 'enabled boolean is required' });
        return;
      }

      sendJson(response, 200, await cameraStreamingController.setEnabled(payload.enabled));
      return;
    }
  }

  if (request.method === 'GET' && pathname === sessionRecordingCapabilityPath) {
    sendJson(response, 200, attachRecordingDownloadPath(config.apiBasePath, await sessionRecordingController.getCapability()));
    return;
  }

  if (request.method === 'POST' && pathname === recordingStartPath) {
    if (!isWriteAuthorized(request, config)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    const payload = await readJsonBody<{ sessionId?: string; sessionDate?: string; sessionStatus?: string }>(request);
    if (!payload.sessionId) {
      sendJson(response, 400, { error: 'sessionId is required' });
      return;
    }

    sendJson(response, 200, attachRecordingDownloadPath(config.apiBasePath, await sessionRecordingController.startRecording(payload)));
    return;
  }

  if (request.method === 'POST' && pathname === recordingStopPath) {
    if (!isWriteAuthorized(request, config)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    let payload: {
      sessionId?: string;
      disposition?: 'save' | 'discard';
      sessionSnapshot?: Session;
      timelineEvents?: unknown[];
    };

    try {
      payload = await readJsonBody<{
        sessionId?: string;
        disposition?: 'save' | 'discard';
        sessionSnapshot?: Session;
        timelineEvents?: unknown[];
      }>(request, { maxBytes: RECORDING_STOP_REQUEST_MAX_BYTES });
    } catch (error) {
      if (error instanceof JsonBodyTooLargeError) {
        sendJson(response, 413, { error: 'Recording stop payload exceeds maximum size of 512KB' });
        return;
      }
      throw error;
    }

    if (!payload.sessionId) {
      sendJson(response, 400, { error: 'sessionId is required' });
      return;
    }

    sendJson(response, 200, attachRecordingDownloadPath(config.apiBasePath, await sessionRecordingController.stopRecording({
      ...payload,
      timelineEvents: normalizeTimelineEvents(payload.timelineEvents),
    })));
    return;
  }

  if (request.method === 'GET' && pathname.startsWith(recordingFilePathPrefix)) {
    if (!isWriteAuthorized(request, config)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    await serveRecordingFile(response, pathname, config);
    return;
  }

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

    const session = await finalizeSessionRecordingArtifacts(config, payload);
    const store = await upsertSession(config.dataFilePath, session);
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
    const existingStore = await readSessionStore(config.dataFilePath);
    const finalizedSessions = await finalizeSessionsRecordingArtifacts(config, sessions, existingStore.sessions);
    const store = await writeSessionStore(config.dataFilePath, finalizedSessions);
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

      try {
        const payload = await readJsonBody<{ cameraUrl?: string; profile?: string; mode?: string; ttlHours?: number }>(request);
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
      const nextSession = await finalizeSessionRecordingArtifacts(config, {
        ...payload,
        id: sessionId,
      });
      const updatedStore = await upsertSession(config.dataFilePath, nextSession);
      sendJson(response, 200, updatedStore);
      return;
    }
  }

  notFound(response);
}

export function createBravePawsServer(config = resolveConfig()) {
  const cameraStreamingController = createCameraStreamingController(config);
  const sessionRecordingController = createSessionRecordingController(config);

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
        if (handleApiPreflight(request, response, config)) {
          return;
        }

        applyCorsHeaders(response, request, config);
        await handleApiRequest(request, response, pathname, config, cameraStreamingController, sessionRecordingController);
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
  const startupCameraStreamingController = createCameraStreamingController(config);
  const startupSessionRecordingController = createSessionRecordingController(config);

  server.listen(config.port, config.host, () => {
    const publicHint = config.publicBaseUrl
      ? `${config.publicBaseUrl.replace(/\/+$/, '')}${config.landingBasePath}`
      : `http://${config.host}:${config.port}${config.landingBasePath}`;

    console.log(`Brave Paws server listening on http://${config.host}:${config.port}`);
    console.log(`Landing page: ${publicHint}`);
    console.log(`API health: http://${config.host}:${config.port}${config.healthPath}`);
    console.log(`Capabilities: http://${config.host}:${config.port}${config.apiBasePath}capabilities`);
    console.log(`Camera proxy: http://${config.host}:${config.port}${config.cameraBasePath}live.stream/`);
    console.log(`Session store: ${config.dataFilePath}`);
    void startupCameraStreamingController.getCapability().then((capability: CameraStreamingCapability) => {
      if (capability.provider === 'command') {
        if (capability.supported && capability.canSetEnabled) {
          console.log(`Camera streaming control: ${capability.label}`);
          if (capability.detail) {
            console.warn(capability.detail);
          }
          return;
        }

        console.warn(capability.detail || 'Camera streaming command provider is configured but unavailable.');
      }
    }).catch((error: unknown) => {
      console.warn('Camera streaming control startup check failed.', error);
    });
    void startupSessionRecordingController.getCapability().then((capability: SessionRecordingCapability) => {
      if (capability.provider === 'command') {
        if (capability.supported && capability.canStart && capability.canStop) {
          console.log(`Session recording control: ${capability.label}`);
          if (capability.detail) {
            console.warn(capability.detail);
          }
          return;
        }

        console.warn(capability.detail || 'Session recording command provider is configured but unavailable.');
      }
    }).catch((error: unknown) => {
      console.warn('Session recording startup check failed.', error);
    });
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
