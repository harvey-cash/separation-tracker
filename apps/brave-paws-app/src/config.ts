type RuntimeEnv = Record<string, string | undefined>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type ResolveUrlOptions = {
  env?: RuntimeEnv;
  origin?: string;
  storage?: StorageLike | null;
};

const runtimeEnv = ((import.meta as unknown as { env?: RuntimeEnv }).env ?? {}) as RuntimeEnv;

const FALLBACK_ORIGIN = 'https://local.brave-paws.invalid';
const DEFAULT_PUBLIC_BASE_PATH = '/separation/';
const DEFAULT_APP_BASE_PATH = '/separation/app/';
const DEFAULT_API_BASE_PATH = '/separation/api/';
const DEFAULT_CAMERA_BASE_PATH = '/separation/camera/live.stream/';
export const BACKEND_ROOT_URL_STORAGE_KEY = 'brave_paws_backend_root_url';

function getRuntimeOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return FALLBACK_ORIGIN;
}

function getStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage;
}

function ensureTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '') + '/';
}

function isSupportedBackendProtocol(url: URL): boolean {
  const isLocalhost =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1';

  return url.protocol === 'https:' || (isLocalhost && url.protocol === 'http:');
}

export function normalizeBackendRootUrl(value: string, _origin = getRuntimeOrigin()): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    if (url.username || url.password || !isSupportedBackendProtocol(url)) {
      return '';
    }

    return url.origin;
  } catch {
    return '';
  }
}

function resolveConfiguredUrl(value: string | undefined, fallbackPath: string, origin = getRuntimeOrigin()): string {
  if (value) {
    try {
      return ensureTrailingSlash(new URL(value, origin).toString());
    } catch {
      // Fall through to the default path-based value.
    }
  }

  return ensureTrailingSlash(new URL(fallbackPath, origin).toString());
}

function resolveBackendDerivedUrl(backendRootUrl: string, fallbackPath: string): string {
  return ensureTrailingSlash(new URL(fallbackPath, ensureTrailingSlash(backendRootUrl)).toString());
}

function safeStorageGet(storage: StorageLike | null, key: string): string | null {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage: StorageLike | null, key: string, value: string): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(storage: StorageLike | null, key: string): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Treat blocked storage as a no-op.
  }
}

export function loadStoredBackendRootUrl(options: { origin?: string; storage?: StorageLike | null } = {}): string | null {
  const storage = options.storage === undefined ? getStorage() : options.storage;
  const normalized = normalizeBackendRootUrl(safeStorageGet(storage, BACKEND_ROOT_URL_STORAGE_KEY) || '', options.origin);
  return normalized || null;
}

export function saveStoredBackendRootUrl(value: string, options: { origin?: string; storage?: StorageLike | null } = {}): string | null {
  const normalized = normalizeBackendRootUrl(value, options.origin);
  const storage = options.storage === undefined ? getStorage() : options.storage;

  if (!storage) {
    return normalized || null;
  }

  if (normalized) {
    safeStorageSet(storage, BACKEND_ROOT_URL_STORAGE_KEY, normalized);
    return normalized;
  }

  safeStorageRemove(storage, BACKEND_ROOT_URL_STORAGE_KEY);
  return null;
}

export function clearStoredBackendRootUrl(storage: StorageLike | null = getStorage()) {
  safeStorageRemove(storage, BACKEND_ROOT_URL_STORAGE_KEY);
}

export function resolveEffectiveBackendRootUrl(options: ResolveUrlOptions = {}): string | null {
  const origin = options.origin ?? getRuntimeOrigin();
  const env = options.env ?? runtimeEnv;
  const runtimeOverride = loadStoredBackendRootUrl({ origin, storage: options.storage });

  if (runtimeOverride) {
    return runtimeOverride;
  }

  const envOverride = normalizeBackendRootUrl(env.VITE_BRAVE_PAWS_BACKEND_ROOT_URL || '', origin);
  return envOverride || null;
}

export function getEffectiveBackendRootUrl(origin = getRuntimeOrigin()): string | null {
  return resolveEffectiveBackendRootUrl({ origin });
}

export function getDeploymentPublicBaseUrl(origin = getRuntimeOrigin(), env = runtimeEnv): string {
  return resolveConfiguredUrl(env.VITE_BRAVE_PAWS_PUBLIC_BASE_URL, DEFAULT_PUBLIC_BASE_PATH, origin);
}

export function getPublicBaseUrl(origin = getRuntimeOrigin()): string {
  return getDeploymentPublicBaseUrl(origin);
}

export function getDeploymentAppUrl(origin = getRuntimeOrigin(), env = runtimeEnv): string {
  return resolveConfiguredUrl(env.VITE_BRAVE_PAWS_APP_URL, DEFAULT_APP_BASE_PATH, origin);
}

export function getAppUrl(origin = getRuntimeOrigin()): string {
  return getDeploymentAppUrl(origin);
}

export function getApiBaseUrlForBackendRoot(backendRootUrl: string): string {
  return resolveBackendDerivedUrl(backendRootUrl, DEFAULT_API_BASE_PATH);
}

export function getDefaultCameraUrlForBackendRoot(backendRootUrl: string): string {
  return resolveBackendDerivedUrl(backendRootUrl, DEFAULT_CAMERA_BASE_PATH);
}

export function resolveApiBaseUrl(options: ResolveUrlOptions = {}): string {
  const origin = options.origin ?? getRuntimeOrigin();
  const env = options.env ?? runtimeEnv;
  const backendRootUrl = resolveEffectiveBackendRootUrl({ ...options, origin, env });

  if (backendRootUrl) {
    return getApiBaseUrlForBackendRoot(backendRootUrl);
  }

  return resolveConfiguredUrl(env.VITE_BRAVE_PAWS_API_BASE_URL, DEFAULT_API_BASE_PATH, origin);
}

export function getDeploymentApiBaseUrl(origin = getRuntimeOrigin(), env = runtimeEnv): string {
  return resolveConfiguredUrl(env.VITE_BRAVE_PAWS_API_BASE_URL, DEFAULT_API_BASE_PATH, origin);
}

export function getApiBaseUrl(origin = getRuntimeOrigin()): string {
  return resolveApiBaseUrl({ origin });
}

export function resolveDefaultCameraUrl(options: ResolveUrlOptions = {}): string {
  const origin = options.origin ?? getRuntimeOrigin();
  const env = options.env ?? runtimeEnv;
  const backendRootUrl = resolveEffectiveBackendRootUrl({ ...options, origin, env });

  if (backendRootUrl) {
    return getDefaultCameraUrlForBackendRoot(backendRootUrl);
  }

  return resolveConfiguredUrl(env.VITE_BRAVE_PAWS_DEFAULT_CAMERA_URL, DEFAULT_CAMERA_BASE_PATH, origin);
}

export function getDeploymentDefaultCameraUrl(origin = getRuntimeOrigin(), env = runtimeEnv): string {
  return resolveConfiguredUrl(env.VITE_BRAVE_PAWS_DEFAULT_CAMERA_URL, DEFAULT_CAMERA_BASE_PATH, origin);
}

export function getDefaultCameraUrl(origin = getRuntimeOrigin()): string {
  return resolveDefaultCameraUrl({ origin });
}

export function getGoogleClientId(): string | undefined {
  return runtimeEnv.VITE_GOOGLE_CLIENT_ID;
}

export function isLocalDevelopmentOrigin(origin = getRuntimeOrigin()): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}
