import { getApiBaseUrl } from '../config';
import { buildCameraPairingUrl, type CameraStreamProfile } from './cameraUrl';
import { parseBackendJsonResponse } from './backendRequests';

export const PAIRING_TOKEN_QUERY_PARAM = 'pairingToken';
const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

type PairingLookupResponse = {
  cameraUrl?: string;
  profile?: CameraStreamProfile;
  mode?: string;
};

export function getPairingTokenFromSearch(search: string): string {
  const token = new URLSearchParams(search).get(PAIRING_TOKEN_QUERY_PARAM)?.trim() || '';
  return PAIRING_TOKEN_PATTERN.test(token) ? token : '';
}

export async function resolveCameraUrlFromPairingToken(
  search: string,
  options: {
    apiBaseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string> {
  const token = getPairingTokenFromSearch(search);
  if (!token) {
    return '';
  }

  const apiBaseUrl = options.apiBaseUrl || getApiBaseUrl();
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`${apiBaseUrl}pairings/${encodeURIComponent(token)}`);

  const payload = await parseBackendJsonResponse<PairingLookupResponse>(response);
  return buildCameraPairingUrl(payload.cameraUrl || '', undefined, {
    profile: payload.profile,
    mode: payload.mode,
  });
}
