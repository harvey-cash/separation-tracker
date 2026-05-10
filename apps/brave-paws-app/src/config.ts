type RuntimeEnv = Record<string, string | undefined>;

const runtimeEnv = ((import.meta as unknown as { env?: RuntimeEnv }).env ?? {}) as RuntimeEnv;

const FALLBACK_ORIGIN = 'https://local.brave-paws.invalid';
const DEFAULT_PUBLIC_BASE_PATH = '/separation/';
const DEFAULT_APP_BASE_PATH = '/separation/app/';
const DEFAULT_API_BASE_PATH = '/separation/api/';
const DEFAULT_CAMERA_BASE_PATH = '/separation/camera/live.stream/';

function getRuntimeOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return FALLBACK_ORIGIN;
}

function ensureTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '') + '/';
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

export function getPublicBaseUrl(origin = getRuntimeOrigin()): string {
  return resolveConfiguredUrl(runtimeEnv.VITE_BRAVE_PAWS_PUBLIC_BASE_URL, DEFAULT_PUBLIC_BASE_PATH, origin);
}

export function getAppUrl(origin = getRuntimeOrigin()): string {
  return resolveConfiguredUrl(runtimeEnv.VITE_BRAVE_PAWS_APP_URL, DEFAULT_APP_BASE_PATH, origin);
}

export function getApiBaseUrl(origin = getRuntimeOrigin()): string {
  return resolveConfiguredUrl(runtimeEnv.VITE_BRAVE_PAWS_API_BASE_URL, DEFAULT_API_BASE_PATH, origin);
}

export function getDefaultCameraUrl(origin = getRuntimeOrigin()): string {
  return resolveConfiguredUrl(runtimeEnv.VITE_BRAVE_PAWS_DEFAULT_CAMERA_URL, DEFAULT_CAMERA_BASE_PATH, origin);
}

export function getGoogleClientId(): string | undefined {
  return runtimeEnv.VITE_GOOGLE_CLIENT_ID;
}
