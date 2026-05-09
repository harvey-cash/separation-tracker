import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(workspaceRoot, '..', '..');

function normalizeBasePath(value: string | undefined, fallback: string): string {
  const trimmed = (value || fallback).trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
  return normalized === '//' ? fallback : normalized;
}

function normalizeBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, '') + '/';
    return url.toString();
  } catch {
    return null;
  }
}

export type BravePawsServerConfig = {
  host: string;
  port: number;
  publicBaseUrl: string | null;
  landingBasePath: string;
  appBasePath: string;
  apiBasePath: string;
  cameraBasePath: string;
  healthPath: string;
  clientDiagnosticsPath: string;
  landingDistDir: string;
  appDistDir: string;
  dataDir: string;
  dataFilePath: string;
  recordingsDir: string;
  pairingStoreFilePath: string;
  pairingEnabled: boolean;
  cameraUpstreamBaseUrl: string;
  cameraControlProvider: 'none' | 'command';
  cameraControlLabel: string;
  cameraControlStatusCommand: string | null;
  cameraControlEnableCommand: string | null;
  cameraControlDisableCommand: string | null;
  recordingProvider: 'none' | 'command';
  recordingLabel: string;
  recordingStatusCommand: string | null;
  recordingStartCommand: string | null;
  recordingStopCommand: string | null;
  authToken: string | null;
};

export function resolveConfig(env = process.env): BravePawsServerConfig {
  const landingBasePath = normalizeBasePath(env.BRAVE_PAWS_PUBLIC_BASE_PATH, '/separation/');
  const appBasePath = normalizeBasePath(env.BRAVE_PAWS_APP_BASE_PATH, `${landingBasePath}app/`);
  const apiBasePath = normalizeBasePath(env.BRAVE_PAWS_API_BASE_PATH, `${landingBasePath}api/`);
  const cameraBasePath = normalizeBasePath(env.BRAVE_PAWS_CAMERA_BASE_PATH, `${landingBasePath}camera/`);
  const dataDir = path.resolve(env.BRAVE_PAWS_DATA_DIR || path.join(repoRoot, 'var', 'brave-paws'));

  return {
    host: env.BRAVE_PAWS_HOST || '127.0.0.1',
    port: Number.parseInt(env.BRAVE_PAWS_PORT || '4310', 10),
    publicBaseUrl: normalizeBaseUrl(env.BRAVE_PAWS_PUBLIC_BASE_URL),
    landingBasePath,
    appBasePath,
    apiBasePath,
    cameraBasePath,
    healthPath: `${apiBasePath}health`,
    clientDiagnosticsPath: `${apiBasePath}client-diagnostics`,
    landingDistDir: path.resolve(env.BRAVE_PAWS_LANDING_DIST_DIR || path.join(repoRoot, 'apps', 'brave-paws-landing', 'dist')),
    appDistDir: path.resolve(env.BRAVE_PAWS_APP_DIST_DIR || path.join(repoRoot, 'apps', 'brave-paws-app', 'dist')),
    dataDir,
    dataFilePath: path.join(dataDir, 'sessions.json'),
    recordingsDir: path.join(dataDir, 'recordings'),
    pairingStoreFilePath: path.resolve(env.BRAVE_PAWS_PAIRING_STORE_FILE || path.join(dataDir, 'pairings.json')),
    pairingEnabled: env.BRAVE_PAWS_ENABLE_PAIRING === 'true',
    cameraUpstreamBaseUrl: (env.BRAVE_PAWS_CAMERA_UPSTREAM_BASE_URL || 'http://127.0.0.1:18888/').replace(/\/?$/, '/'),
    cameraControlProvider: env.BRAVE_PAWS_CAMERA_CONTROL_PROVIDER === 'command' ? 'command' : 'none',
    cameraControlLabel: env.BRAVE_PAWS_CAMERA_CONTROL_LABEL || 'Camera streaming',
    cameraControlStatusCommand: env.BRAVE_PAWS_CAMERA_STATUS_COMMAND?.trim() || null,
    cameraControlEnableCommand: env.BRAVE_PAWS_CAMERA_ENABLE_COMMAND?.trim() || null,
    cameraControlDisableCommand: env.BRAVE_PAWS_CAMERA_DISABLE_COMMAND?.trim() || null,
    recordingProvider: env.BRAVE_PAWS_RECORDING_PROVIDER === 'command' ? 'command' : 'none',
    recordingLabel: env.BRAVE_PAWS_RECORDING_LABEL || 'Session recording',
    recordingStatusCommand: env.BRAVE_PAWS_RECORDING_STATUS_COMMAND?.trim() || null,
    recordingStartCommand: env.BRAVE_PAWS_RECORDING_START_COMMAND?.trim() || null,
    recordingStopCommand: env.BRAVE_PAWS_RECORDING_STOP_COMMAND?.trim() || null,
    authToken: env.BRAVE_PAWS_AUTH_TOKEN || null,
  };
}
