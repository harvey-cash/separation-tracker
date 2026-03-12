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

export function isCameraUrlValid(value: string): boolean {
  return sanitizeCameraUrl(value).length > 0;
}

export function buildCameraStreamUrl(value: string): string {
  const sanitized = sanitizeCameraUrl(value);

  if (!sanitized) {
    return '';
  }

  return `${sanitized}/stream.html?src=camera&mode=mse`;
}

export function getCameraUrlValidationMessage(value: string): string {
  if (!value.trim()) {
    return 'Add a Cloudflare camera link or scan the QR code from your Windows helper.';
  }

  return isCameraUrlValid(value)
    ? 'Link looks good. Brave Paws will use it for remote preview.'
    : 'Use an https link, or http only for localhost testing.';
}