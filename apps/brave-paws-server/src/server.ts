import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { resolveConfig, type BravePawsServerConfig } from './config.js';
import { readSessionStore, upsertSession, writeSessionStore } from './storage.js';
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

async function proxyCameraRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  config: BravePawsServerConfig,
) {
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
      dataFilePath: config.dataFilePath,
      sessionCount: store.sessions.length,
      updatedAt: store.updatedAt,
    });
    return;
  }

  const sessionsCollectionPath = `${config.apiBasePath}sessions`;
  const syncPullPath = `${config.apiBasePath}sync/pull`;
  const syncPushPath = `${config.apiBasePath}sync/push`;

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
      sendText(
        response,
        500,
        error instanceof Error ? error.stack || error.message : 'Unknown server error',
      );
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
  });
}
