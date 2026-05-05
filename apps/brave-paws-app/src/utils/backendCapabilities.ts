import { getApiBaseUrl } from '../config';

export type CameraStreamingCapability = {
  key: 'cameraStreaming';
  label: string;
  provider: string;
  supported: boolean;
  canSetEnabled: boolean;
  enabled: boolean | null;
  detail: string | null;
};

export type BackendCapabilities = {
  cameraStreaming: CameraStreamingCapability;
};

export const UNSUPPORTED_CAMERA_STREAMING_CAPABILITY: CameraStreamingCapability = {
  key: 'cameraStreaming',
  label: 'Camera streaming',
  provider: 'none',
  supported: false,
  canSetEnabled: false,
  enabled: null,
  detail: 'This backend does not expose camera streaming control.',
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function fetchBackendCapabilities(
  fetchImpl: typeof fetch = fetch,
  apiBaseUrl = getApiBaseUrl(),
): Promise<BackendCapabilities> {
  const response = await fetchImpl(`${apiBaseUrl}capabilities`);
  return parseJsonResponse<BackendCapabilities>(response);
}

export async function setCameraStreamingEnabled(
  enabled: boolean,
  fetchImpl: typeof fetch = fetch,
  apiBaseUrl = getApiBaseUrl(),
): Promise<CameraStreamingCapability> {
  const response = await fetchImpl(`${apiBaseUrl}capabilities/camera-streaming`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });

  return parseJsonResponse<CameraStreamingCapability>(response);
}
