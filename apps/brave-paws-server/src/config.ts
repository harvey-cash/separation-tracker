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
  pairingStoreFilePath: string;
  pairingEnabled: boolean;
  cameraUpstreamBaseUrl: string;
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
    pairingStoreFilePath: path.resolve(env.BRAVE_PAWS_PAIRING_STORE_FILE || path.join(dataDir, 'pairings.json')),
    pairingEnabled: env.BRAVE_PAWS_ENABLE_PAIRING === 'true',
    cameraUpstreamBaseUrl: (env.BRAVE_PAWS_CAMERA_UPSTREAM_BASE_URL || 'http://127.0.0.1:18888/').replace(/\/?$/, '/'),
    authToken: env.BRAVE_PAWS_AUTH_TOKEN || null,
  };
}
