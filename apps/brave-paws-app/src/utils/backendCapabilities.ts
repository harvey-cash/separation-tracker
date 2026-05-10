import { getApiBaseUrl } from '../config';
import type { Session, SessionRecording, SessionTimelineEvent } from '../types';
import { parseBackendJsonResponse } from './backendRequests';

export type CameraStreamingCapability = {
  key: 'cameraStreaming';
  label: string;
  provider: string;
  supported: boolean;
  canSetEnabled: boolean;
  enabled: boolean | null;
  detail: string | null;
};

export type SessionRecordingCapability = {
  key: 'sessionRecording';
  label: string;
  provider: string;
  supported: boolean;
  canStart: boolean;
  canStop: boolean;
  active: boolean;
  sessionId: string | null;
  detail: string | null;
  recording: SessionRecording | null;
};

export type BackendCapabilities = {
  cameraStreaming: CameraStreamingCapability;
  sessionRecording: SessionRecordingCapability;
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

export const UNSUPPORTED_SESSION_RECORDING_CAPABILITY: SessionRecordingCapability = {
  key: 'sessionRecording',
  label: 'Session recording',
  provider: 'none',
  supported: false,
  canStart: false,
  canStop: false,
  active: false,
  sessionId: null,
  detail: 'This backend does not expose session recording.',
  recording: null,
};

export async function fetchBackendCapabilities(
  fetchImpl: typeof fetch = fetch,
  apiBaseUrl = getApiBaseUrl(),
): Promise<BackendCapabilities> {
  const response = await fetchImpl(`${apiBaseUrl}capabilities`);
  return parseBackendJsonResponse<BackendCapabilities>(response);
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

  return parseBackendJsonResponse<CameraStreamingCapability>(response);
}

export async function fetchSessionRecordingCapability(
  fetchImpl: typeof fetch = fetch,
  apiBaseUrl = getApiBaseUrl(),
): Promise<SessionRecordingCapability> {
  const response = await fetchImpl(`${apiBaseUrl}capabilities/recording`);
  return parseBackendJsonResponse<SessionRecordingCapability>(response);
}

export async function startSessionRecording(
  payload: { sessionId: string; sessionDate?: string; sessionStatus?: string },
  fetchImpl: typeof fetch = fetch,
  apiBaseUrl = getApiBaseUrl(),
): Promise<SessionRecordingCapability> {
  const response = await fetchImpl(`${apiBaseUrl}recording/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseBackendJsonResponse<SessionRecordingCapability>(response);
}

export async function stopSessionRecording(
  payload: {
    sessionId: string;
    disposition?: 'save' | 'discard';
    sessionSnapshot?: Session;
    timelineEvents?: SessionTimelineEvent[];
  },
  fetchImpl: typeof fetch = fetch,
  apiBaseUrl = getApiBaseUrl(),
): Promise<SessionRecordingCapability> {
  const response = await fetchImpl(`${apiBaseUrl}recording/stop`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseBackendJsonResponse<SessionRecordingCapability>(response);
}
