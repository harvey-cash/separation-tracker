export const CAMERA_URL_STORAGE_KEY = 'csa_camera_url';
export const CAMERA_URL_QUERY_PARAM = 'cameraUrl';
export const BRAVE_PAWS_PAIRING_URL = 'https://harvey.cash/separation/app/';

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
  try {
    const url = new URL(value.trim());
    const candidate = url.searchParams.get(CAMERA_URL_QUERY_PARAM);
    if (candidate) {
      return sanitizeCameraUrl(candidate);
    }
  } catch {
    return sanitizeCameraUrl(value);
  }

  return sanitizeCameraUrl(value);
}

export function isCameraUrlValid(value: string): boolean {
  return extractCameraUrlFromValue(value).length > 0;
}

export function buildCameraStreamUrl(value: string): string {
  const sanitized = extractCameraUrlFromValue(value);

  if (!sanitized) {
    return '';
  }

  return `${sanitized}/stream.html?src=camera&mode=mse`;
}

export function buildCameraPairingUrl(cameraUrl: string, appUrl = BRAVE_PAWS_PAIRING_URL): string {
  const sanitizedCameraUrl = sanitizeCameraUrl(cameraUrl);
  if (!sanitizedCameraUrl) {
    return '';
  }

  const pairingUrl = new URL(appUrl);
  pairingUrl.searchParams.set(CAMERA_URL_QUERY_PARAM, sanitizedCameraUrl);
  return pairingUrl.toString();
}

export function getCameraUrlFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  return sanitizeCameraUrl(params.get(CAMERA_URL_QUERY_PARAM) || '');
}

export function getCameraUrlValidationMessage(value: string): string {
  if (!value.trim()) {
    return 'Add a stream link or scan the QR code from Brave Paws Streamer.';
  }

  return isCameraUrlValid(value)
    ? 'Link looks good. Brave Paws will use it for remote preview.'
    : 'Use a Brave Paws pairing link, a direct https stream link, or http only for localhost testing.';
}