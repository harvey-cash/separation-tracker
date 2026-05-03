import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const PAIRING_TOKEN_QUERY_PARAM = 'pairingToken';
export const DEFAULT_CAMERA_STREAM_PROFILE = 'remote-low-latency';
export const DEFAULT_CAMERA_STREAM_MODE = 'mse,mp4,mjpeg';
const DEFAULT_PAIRING_TTL_HOURS = 24 * 7;
const PRUNE_CONSUMED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_CAMERA_STREAM_MODES = new Set(['webrtc', 'webrtc/tcp', 'mse', 'hls', 'mp4', 'mjpeg']);
const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const pairingStoreLocks = new Map<string, Promise<void>>();

export type CameraStreamProfile = 'local-quality' | 'remote-low-latency';

export type CameraLaunchConfig = {
  cameraUrl: string;
  profile: CameraStreamProfile;
  mode: string;
};

export type PairingRecord = {
  token: string;
  createdAt: string;
  expiresAt: string | null;
  consumedAt: string | null;
  launchConfig: CameraLaunchConfig;
};

type PairingStore = {
  updatedAt: string | null;
  pairings: PairingRecord[];
};

const EMPTY_PAIRING_STORE: PairingStore = {
  updatedAt: null,
  pairings: [],
};

function sanitizeCameraUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    const hasValidProtocol = url.protocol === 'https:' || (isLocalhost && url.protocol === 'http:');

    if (!hasValidProtocol || url.username || url.password) {
      return '';
    }

    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/+$/, (match, offset, fullValue) => (fullValue.endsWith('/') ? '/' : ''));
  } catch {
    return '';
  }
}

function sanitizeCameraProfile(value: string): CameraStreamProfile {
  if (value === 'local-quality' || value === 'remote-low-latency') {
    return value;
  }

  return DEFAULT_CAMERA_STREAM_PROFILE;
}

function sanitizeCameraMode(value: string): string {
  const normalized = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => ALLOWED_CAMERA_STREAM_MODES.has(entry));

  if (!normalized.length) {
    return DEFAULT_CAMERA_STREAM_MODE;
  }

  return Array.from(new Set(normalized)).join(',');
}

export function normalizeCameraLaunchConfig(candidate: Partial<CameraLaunchConfig>): CameraLaunchConfig | null {
  const cameraUrl = sanitizeCameraUrl(candidate.cameraUrl || '');
  if (!cameraUrl) {
    return null;
  }

  return {
    cameraUrl,
    profile: sanitizeCameraProfile(candidate.profile || DEFAULT_CAMERA_STREAM_PROFILE),
    mode: sanitizeCameraMode(candidate.mode || DEFAULT_CAMERA_STREAM_MODE),
  };
}

async function ensureParentDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readPairingStore(filePath: string): Promise<PairingStore> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PairingStore>;
    const pairings = Array.isArray(parsed.pairings)
      ? parsed.pairings
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const record = entry as Partial<PairingRecord> & { launchConfig?: Partial<CameraLaunchConfig> };
          if (typeof record.token !== 'string' || !record.token) {
            return null;
          }

          const launchConfig = normalizeCameraLaunchConfig(record.launchConfig || {});
          if (!launchConfig) {
            return null;
          }

          return {
            token: record.token,
            createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
            expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
            consumedAt: typeof record.consumedAt === 'string' ? record.consumedAt : null,
            launchConfig,
          } satisfies PairingRecord;
        })
        .filter((entry): entry is PairingRecord => Boolean(entry))
      : [];

    return {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      pairings,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY_PAIRING_STORE };
    }

    throw error;
  }
}

function isExpired(record: PairingRecord, nowMs = Date.now()) {
  return Boolean(record.expiresAt && Date.parse(record.expiresAt) <= nowMs);
}

function prunePairings(pairings: PairingRecord[], nowMs = Date.now()) {
  return pairings.filter((entry) => {
    if (isExpired(entry, nowMs)) {
      return false;
    }

    if (entry.consumedAt) {
      return nowMs - Date.parse(entry.consumedAt) <= PRUNE_CONSUMED_AFTER_MS;
    }

    return true;
  });
}

async function writePairingStore(filePath: string, pairings: PairingRecord[]): Promise<PairingStore> {
  await ensureParentDirectory(filePath);

  const payload: PairingStore = {
    updatedAt: new Date().toISOString(),
    pairings: prunePairings(pairings),
  };

  const tempFilePath = path.join(path.dirname(filePath), `${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(tempFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tempFilePath, filePath);
  return payload;
}

async function withPairingStoreLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = pairingStoreLocks.get(filePath) || Promise.resolve();
  let releaseLock = () => {};
  const current = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const next = previous.catch(() => undefined).then(() => current);
  pairingStoreLocks.set(filePath, next);

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseLock();
    if (pairingStoreLocks.get(filePath) === next) {
      pairingStoreLocks.delete(filePath);
    }
  }
}

function normalizePairingToken(token: string): string {
  const normalized = token.trim();
  return PAIRING_TOKEN_PATTERN.test(normalized) ? normalized : '';
}

export async function createPairing(
  filePath: string,
  candidate: Partial<CameraLaunchConfig>,
  options: { ttlHours?: number } = {},
): Promise<PairingRecord> {
  const launchConfig = normalizeCameraLaunchConfig(candidate);
  if (!launchConfig) {
    throw new Error('A valid https:// camera URL without embedded credentials is required for pairing creation');
  }

  return withPairingStoreLock(filePath, async () => {
    const store = await readPairingStore(filePath);
    const ttlHours = Number.isFinite(options.ttlHours) ? Math.max(1, Math.trunc(options.ttlHours as number)) : DEFAULT_PAIRING_TTL_HOURS;
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + (ttlHours * 60 * 60 * 1000)).toISOString();

    const record: PairingRecord = {
      token: crypto.randomBytes(18).toString('base64url'),
      createdAt,
      expiresAt,
      consumedAt: null,
      launchConfig,
    };

    await writePairingStore(filePath, [...store.pairings, record]);
    return record;
  });
}

export async function consumePairing(filePath: string, token: string): Promise<PairingRecord | null> {
  const normalizedToken = normalizePairingToken(token);
  if (!normalizedToken) {
    return null;
  }

  return withPairingStoreLock(filePath, async () => {
    const store = await readPairingStore(filePath);
    const recordIndex = store.pairings.findIndex((entry) => entry.token === normalizedToken);
    if (recordIndex < 0) {
      return null;
    }

    const record = store.pairings[recordIndex];
    if (!record || record.consumedAt || isExpired(record)) {
      await writePairingStore(filePath, store.pairings);
      return null;
    }

    const consumedRecord: PairingRecord = {
      ...record,
      consumedAt: new Date().toISOString(),
    };

    const nextPairings = [...store.pairings];
    nextPairings[recordIndex] = consumedRecord;
    await writePairingStore(filePath, nextPairings);
    return consumedRecord;
  });
}

export function buildPairingAppUrl(baseUrl: string, appBasePath: string, token: string): string {
  const pairingUrl = new URL(appBasePath, baseUrl);
  pairingUrl.searchParams.set(PAIRING_TOKEN_QUERY_PARAM, token);
  return pairingUrl.toString();
}
