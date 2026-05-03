import { getApiBaseUrl } from '../config';

export type ClientDiagnosticSeverity = 'info' | 'warn' | 'error';
export type ClientDiagnosticCategory = 'frontend_error' | 'quantum_sync_error' | 'camera_preview_issue';

export type ClientDiagnosticEvent = {
  category: ClientDiagnosticCategory;
  severity: ClientDiagnosticSeverity;
  message: string;
  fingerprint?: string;
  details?: Record<string, unknown>;
  occurredAt?: string;
};

const MAX_EVENTS_PER_WINDOW = 12;
const DEDUPE_WINDOW_MS = 60_000;
const MAX_STRING_LENGTH = 500;
const recentFingerprints = new Map<string, number>();
let sentEventCount = 0;
let globalDiagnosticsInstalled = false;

function trimString(value: string, maxLength = MAX_STRING_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return trimString(value);
  }

  if (value instanceof Error) {
    return {
      name: trimString(value.name),
      message: trimString(value.message),
      stack: trimString(value.stack || '', 2_000),
    };
  }

  if (depth >= 4) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, entry]) => [trimString(key, 80), sanitizeValue(entry, depth + 1)]),
    );
  }

  return trimString(String(value));
}

function buildFingerprint(event: ClientDiagnosticEvent): string {
  return trimString(event.fingerprint || `${event.category}:${event.message}`, 200);
}

export function shouldSendDiagnosticFingerprint(
  recent: Map<string, number>,
  fingerprint: string,
  now: number,
  sentCount: number,
  options: { dedupeWindowMs?: number; maxEventsPerWindow?: number } = {},
): boolean {
  const dedupeWindowMs = options.dedupeWindowMs ?? DEDUPE_WINDOW_MS;
  const maxEventsPerWindow = options.maxEventsPerWindow ?? MAX_EVENTS_PER_WINDOW;

  for (const [key, seenAt] of recent.entries()) {
    if (now - seenAt > dedupeWindowMs) {
      recent.delete(key);
    }
  }

  if (sentCount >= maxEventsPerWindow) {
    return false;
  }

  const existing = recent.get(fingerprint);
  if (existing && now - existing < dedupeWindowMs) {
    return false;
  }

  return true;
}

function buildPayload(event: ClientDiagnosticEvent) {
  return {
    category: event.category,
    severity: event.severity,
    message: trimString(event.message),
    fingerprint: buildFingerprint(event),
    occurredAt: event.occurredAt || new Date().toISOString(),
    pageUrl: typeof window !== 'undefined' ? window.location.href : null,
    userAgent: typeof navigator !== 'undefined' ? trimString(navigator.userAgent, 300) : null,
    details: sanitizeValue(event.details ?? {}),
  };
}

export function reportClientDiagnostic(event: ClientDiagnosticEvent): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const now = Date.now();
  const fingerprint = buildFingerprint(event);
  if (!shouldSendDiagnosticFingerprint(recentFingerprints, fingerprint, now, sentEventCount)) {
    return false;
  }

  recentFingerprints.set(fingerprint, now);
  sentEventCount += 1;

  const payload = JSON.stringify(buildPayload(event));
  const endpoint = new URL('client-diagnostics', getApiBaseUrl()).toString();

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(endpoint, blob);
    return true;
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: payload,
    keepalive: true,
  }).catch(() => {});

  return true;
}

export function installGlobalClientDiagnostics() {
  if (typeof window === 'undefined' || globalDiagnosticsInstalled) {
    return;
  }

  globalDiagnosticsInstalled = true;

  window.addEventListener('error', (event) => {
    reportClientDiagnostic({
      category: 'frontend_error',
      severity: 'error',
      message: event.message || 'Unhandled frontend error',
      fingerprint: `error:${event.filename || 'inline'}:${event.lineno || 0}:${event.colno || 0}:${event.message || 'unknown'}`,
      details: {
        filename: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null,
        error: event.error,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error
      ? event.reason
      : new Error(typeof event.reason === 'string' ? event.reason : 'Unhandled promise rejection');

    reportClientDiagnostic({
      category: 'frontend_error',
      severity: 'error',
      message: reason.message || 'Unhandled promise rejection',
      fingerprint: `rejection:${reason.name}:${reason.message}`,
      details: {
        reason,
      },
    });
  });
}
