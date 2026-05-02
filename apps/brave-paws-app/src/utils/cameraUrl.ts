export const CAMERA_URL_STORAGE_KEY = 'csa_camera_url';
export const CAMERA_URL_QUERY_PARAM = 'cameraUrl';
export const CAMERA_PROFILE_QUERY_PARAM = 'cameraProfile';
export const CAMERA_MODE_QUERY_PARAM = 'cameraMode';
export const BRAVE_PAWS_PAIRING_URL = 'https://harvey.cash/separation/app/';
export const LOW_LATENCY_CAMERA_STREAM_PROFILE = 'remote-low-latency';
export const LOW_LATENCY_CAMERA_STREAM_MODE = 'mse,mp4,mjpeg';
export const DEFAULT_CAMERA_STREAM_PROFILE = LOW_LATENCY_CAMERA_STREAM_PROFILE;
export const DEFAULT_CAMERA_STREAM_MODE = LOW_LATENCY_CAMERA_STREAM_MODE;

export type CameraStreamProfile = 'local-quality' | 'remote-low-latency';

type CameraLaunchConfig = {
  cameraUrl: string;
  profile: CameraStreamProfile;
  mode: string;
};

const ALLOWED_CAMERA_STREAM_MODES = new Set(['webrtc', 'webrtc/tcp', 'mse', 'hls', 'mp4', 'mjpeg']);

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

function getDefaultModeForProfile(profile: CameraStreamProfile): string {
  if (profile === 'local-quality') {
    return 'mse';
  }

  return LOW_LATENCY_CAMERA_STREAM_MODE;
}

function extractCameraLaunchConfig(value: string): CameraLaunchConfig {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      cameraUrl: '',
      profile: DEFAULT_CAMERA_STREAM_PROFILE,
      mode: DEFAULT_CAMERA_STREAM_MODE,
    };
  }

  try {
    const url = new URL(trimmed);
    const candidate = url.searchParams.get(CAMERA_URL_QUERY_PARAM);
    if (candidate) {
      const cameraUrl = sanitizeCameraUrl(candidate);
      const profile = sanitizeCameraProfile(url.searchParams.get(CAMERA_PROFILE_QUERY_PARAM) || '');
      const mode = sanitizeCameraMode(url.searchParams.get(CAMERA_MODE_QUERY_PARAM) || getDefaultModeForProfile(profile));

      return {
        cameraUrl,
        profile,
        mode,
      };
    }
  } catch {
    return {
      cameraUrl: sanitizeCameraUrl(value),
      profile: DEFAULT_CAMERA_STREAM_PROFILE,
      mode: DEFAULT_CAMERA_STREAM_MODE,
    };
  }

  return {
    cameraUrl: sanitizeCameraUrl(value),
    profile: DEFAULT_CAMERA_STREAM_PROFILE,
    mode: DEFAULT_CAMERA_STREAM_MODE,
  };
}

function serializeCameraLaunchConfig(config: CameraLaunchConfig, options: { preservePairingLink?: boolean } = {}): string {
  if (!config.cameraUrl) {
    return '';
  }

  const sanitizedCameraUrl = sanitizeCameraUrl(config.cameraUrl);
  if (!sanitizedCameraUrl) {
    return '';
  }

  const profile = sanitizeCameraProfile(config.profile);
  const mode = sanitizeCameraMode(config.mode || getDefaultModeForProfile(profile));

  if (!options.preservePairingLink && profile === DEFAULT_CAMERA_STREAM_PROFILE && mode === DEFAULT_CAMERA_STREAM_MODE) {
    return sanitizedCameraUrl;
  }

  return buildCameraPairingUrl(sanitizedCameraUrl, BRAVE_PAWS_PAIRING_URL, { profile, mode });
}

export function normalizeCameraUrlValue(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  let preservePairingLink = false;

  try {
    const url = new URL(trimmed);
    preservePairingLink = url.searchParams.has(CAMERA_URL_QUERY_PARAM);
  } catch {
    preservePairingLink = false;
  }

  return serializeCameraLaunchConfig(extractCameraLaunchConfig(value), { preservePairingLink });
}

export function sanitizeCameraUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    const isLocalhost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1';
    const hasValidProtocol = url.protocol === 'https:' || (isLocalhost && url.protocol === 'http:');

    if (!hasValidProtocol) {
      return '';
    }

    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function extractCameraUrlFromValue(value: string): string {
  return extractCameraLaunchConfig(value).cameraUrl;
}

export function isCameraUrlValid(value: string): boolean {
  return extractCameraUrlFromValue(value).length > 0;
}

export function buildCameraStreamUrl(value: string): string {
  const config = extractCameraLaunchConfig(value);

  if (!config.cameraUrl) {
    return '';
  }

  const streamUrl = new URL('/stream.html', `${config.cameraUrl.replace(/\/+$/, '')}/`);
  streamUrl.searchParams.set('src', 'camera');
  streamUrl.searchParams.set('mode', config.mode);
  return streamUrl.toString();
}

export function buildCameraPairingUrl(
  cameraUrl: string,
  appUrl = BRAVE_PAWS_PAIRING_URL,
  options: { profile?: CameraStreamProfile; mode?: string } = {},
): string {
  const sanitizedCameraUrl = sanitizeCameraUrl(cameraUrl);
  if (!sanitizedCameraUrl) {
    return '';
  }

  const profile = sanitizeCameraProfile(options.profile || DEFAULT_CAMERA_STREAM_PROFILE);
  const mode = sanitizeCameraMode(options.mode || getDefaultModeForProfile(profile));
  const pairingUrl = new URL(appUrl);
  pairingUrl.searchParams.set(CAMERA_URL_QUERY_PARAM, sanitizedCameraUrl);
  pairingUrl.searchParams.set(CAMERA_PROFILE_QUERY_PARAM, profile);
  pairingUrl.searchParams.set(CAMERA_MODE_QUERY_PARAM, mode);
  return pairingUrl.toString();
}

export function getCameraUrlFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  const cameraUrl = params.get(CAMERA_URL_QUERY_PARAM) || '';
  const profileParam = params.get(CAMERA_PROFILE_QUERY_PARAM) || '';
  const modeParam = params.get(CAMERA_MODE_QUERY_PARAM) || '';
  const profile: CameraStreamProfile | undefined = profileParam
    ? sanitizeCameraProfile(profileParam)
    : undefined;

  return normalizeCameraUrlValue(
    buildCameraPairingUrl(cameraUrl, BRAVE_PAWS_PAIRING_URL, {
      profile,
      mode: modeParam || undefined,
    }),
  );
}

export function getCameraUrlValidationMessage(value: string): string {
  if (!value.trim()) {
    return 'Add a camera URL or scan the QR code from Brave Paws Streamer.';
  }

  return isCameraUrlValid(value)
    ? 'Camera link looks good. Brave Paws will use it for remote preview.'
    : 'Use the Brave Paws pairing link, or http only for localhost testing.';
}
