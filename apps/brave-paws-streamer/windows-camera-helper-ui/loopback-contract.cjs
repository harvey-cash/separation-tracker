const crypto = require('node:crypto');

const STREAMER_PROTOCOL_VERSION = '1.0';
const DEFAULT_LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_LOOPBACK_PORT = 4380;
const DEFAULT_STREAMER_UI_URL = 'https://harvey.cash/separation/streamer/';
const DEFAULT_APP_URL = 'https://harvey.cash/separation/app/';
const STREAMER_HELPER_NAME = 'brave-paws-streamer';
const STREAMER_HELPER_PLATFORM = 'windows';
const TOKEN_HEADER = 'x-brave-paws-session';
const CAMERA_PROFILE_QUERY_PARAM = 'cameraProfile';
const CAMERA_MODE_QUERY_PARAM = 'cameraMode';

const LOOPBACK_API_PATHS = {
  manifest: '/',
  bootstrap: '/api/bootstrap',
  status: '/api/status',
  refreshDevices: '/api/refresh-devices',
  start: '/api/start',
  stop: '/api/stop',
  events: '/api/events',
};

const STREAMER_EVENT_TYPES = {
  hello: 'hello',
  state: 'state',
  status: 'status',
  devices: 'devices',
  log: 'log',
  error: 'error',
};

function getStreamerUiUrl() {
  return process.env.BRAVE_PAWS_STREAMER_UI_URL || DEFAULT_STREAMER_UI_URL;
}

function getBravePawsAppUrl() {
  return process.env.BRAVE_PAWS_APP_URL || DEFAULT_APP_URL;
}

function buildLoopbackBaseUrl(port = DEFAULT_LOOPBACK_PORT, host = DEFAULT_LOOPBACK_HOST) {
  return `http://${host}:${port}`;
}

function createLaunchToken() {
  return process.env.CAMERA_HELPER_TOKEN || crypto.randomBytes(24).toString('hex');
}

function buildHostedUiLaunchUrl({ port = DEFAULT_LOOPBACK_PORT, token }) {
  const launchUrl = new URL(getStreamerUiUrl());
  launchUrl.hash = new URLSearchParams({
    loopback: buildLoopbackBaseUrl(port),
    token,
    platform: STREAMER_HELPER_PLATFORM,
    protocol: STREAMER_PROTOCOL_VERSION,
  }).toString();
  return launchUrl.toString();
}

function buildPairingUrl(cameraUrl, options = {}) {
  const pairingUrl = new URL(getBravePawsAppUrl());
  pairingUrl.searchParams.set('cameraUrl', cameraUrl);

  const profile = typeof options.profile === 'string' ? options.profile.trim() : '';
  const mode = typeof options.mode === 'string' ? options.mode.trim() : '';

  if (profile) {
    pairingUrl.searchParams.set(CAMERA_PROFILE_QUERY_PARAM, profile);
  }

  if (mode) {
    pairingUrl.searchParams.set(CAMERA_MODE_QUERY_PARAM, mode);
  }

  return pairingUrl.toString();
}

function parseAllowedOrigins() {
  const configuredOrigins = (process.env.STREAMER_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const uiOrigin = new URL(getStreamerUiUrl()).origin;
  return new Set([uiOrigin, ...configuredOrigins]);
}

function isOriginAllowed(origin, allowedOrigins = parseAllowedOrigins()) {
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(origin);
}

function getRequestToken(request) {
  const authorization = request.headers.authorization || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  const headerToken = request.headers[TOKEN_HEADER];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  if (typeof request.query?.token === 'string' && request.query.token.trim()) {
    return request.query.token.trim();
  }

  return '';
}

function jsonError(message, statusCode = 500, code = 'UNKNOWN_ERROR') {
  return {
    error: {
      code,
      message,
    },
    statusCode,
  };
}

function createCorsMiddleware({ allowedOrigins }) {
  return (request, response, next) => {
    const origin = request.headers.origin || '';

    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', `Content-Type, Authorization, ${TOKEN_HEADER}`);
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  };
}

function createAuthMiddleware({ launchToken, allowedOrigins }) {
  return (request, response, next) => {
    const origin = request.headers.origin || '';
    if (!isOriginAllowed(origin, allowedOrigins)) {
      response.status(403).json(jsonError('This Brave Paws Streamer helper only accepts the hosted streamer UI origin.', 403, 'ORIGIN_NOT_ALLOWED'));
      return;
    }

    const requestToken = getRequestToken(request);
    if (!requestToken || requestToken !== launchToken) {
      response.status(401).json(jsonError('Missing or invalid Brave Paws Streamer session token.', 401, 'INVALID_SESSION_TOKEN'));
      return;
    }

    next();
  };
}

function writeSseEvent(response, eventType, payload) {
  response.write(`event: ${eventType}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

module.exports = {
  CAMERA_MODE_QUERY_PARAM,
  CAMERA_PROFILE_QUERY_PARAM,
  DEFAULT_LOOPBACK_HOST,
  DEFAULT_LOOPBACK_PORT,
  LOOPBACK_API_PATHS,
  STREAMER_EVENT_TYPES,
  STREAMER_HELPER_NAME,
  STREAMER_HELPER_PLATFORM,
  STREAMER_PROTOCOL_VERSION,
  TOKEN_HEADER,
  buildHostedUiLaunchUrl,
  buildLoopbackBaseUrl,
  buildPairingUrl,
  createAuthMiddleware,
  createCorsMiddleware,
  createLaunchToken,
  getBravePawsAppUrl,
  getRequestToken,
  getStreamerUiUrl,
  isOriginAllowed,
  jsonError,
  parseAllowedOrigins,
  writeSseEvent,
};