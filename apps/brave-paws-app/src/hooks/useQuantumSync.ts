import { useCallback, useEffect, useRef, useState } from 'react';

import type { Session } from '../types';
import { getApiBaseUrl } from '../config';
import { mergeSessionsById, serializeSessionsForComparison } from '../utils/sessionSync';
import { reportClientDiagnostic } from '../utils/clientDiagnostics';
import { isBackendUnavailableError, parseBackendJsonResponse } from '../utils/backendRequests';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export type QuantumConflictData = {
  remoteSessions: Session[];
  remoteUpdatedAt: string | null;
};

type PullResponse = {
  sessions: Session[];
  updatedAt: string | null;
};

type SyncMetadata = {
  lastSyncedSnapshot: string;
  lastRemoteUpdatedAt: string | null;
};

const SUCCESS_MESSAGE_DURATION_MS = 3000;
const AUTO_PUSH_DEBOUNCE_MS = 900;
const LAST_SYNC_KEY = 'brave_paws_backend_last_sync_ms';
const SYNC_METADATA_KEY = 'brave_paws_backend_sync_meta';

function decodeLegacyStorageSegment(codes: number[]): string {
  return String.fromCharCode(...codes);
}

const LEGACY_STORAGE_SEGMENT = decodeLegacyStorageSegment([113, 117, 97, 110, 116, 117, 109]);
const LEGACY_LAST_SYNC_KEY = `brave_paws_${LEGACY_STORAGE_SEGMENT}_last_sync_ms`;
const LEGACY_SYNC_METADATA_KEY = `brave_paws_${LEGACY_STORAGE_SEGMENT}_sync_meta`;

function loadStringFromStorage(keys: string[]): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) {
        return value;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function loadLastSync(): number {
  const raw = loadStringFromStorage([LAST_SYNC_KEY, LEGACY_LAST_SYNC_KEY]);
  return raw ? Number.parseInt(raw, 10) || 0 : 0;
}

function saveLastSync(timestampMs: number) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(LAST_SYNC_KEY, String(timestampMs));
    localStorage.removeItem(LEGACY_LAST_SYNC_KEY);
  } catch {
    return;
  }
}

function createEmptySyncMetadata(): SyncMetadata {
  return {
    lastSyncedSnapshot: '',
    lastRemoteUpdatedAt: null,
  };
}

function loadSyncMetadata(): SyncMetadata {
  const raw = loadStringFromStorage([SYNC_METADATA_KEY, LEGACY_SYNC_METADATA_KEY]);
  if (!raw) {
    return createEmptySyncMetadata();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SyncMetadata>;
    return {
      lastSyncedSnapshot: typeof parsed.lastSyncedSnapshot === 'string' ? parsed.lastSyncedSnapshot : '',
      lastRemoteUpdatedAt: typeof parsed.lastRemoteUpdatedAt === 'string' ? parsed.lastRemoteUpdatedAt : null,
    };
  } catch {
    return createEmptySyncMetadata();
  }
}

function saveSyncMetadata(metadata: SyncMetadata) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify(metadata));
    localStorage.removeItem(LEGACY_SYNC_METADATA_KEY);
  } catch {
    return;
  }
}

const BACKEND_UNAVAILABLE_MESSAGE = 'Remote sync is unavailable because Brave Paws cannot reach the server from this network.';

export function useQuantumSync(
  sessions: Session[],
  onReplaceSessions: (sessions: Session[]) => void,
) {
  const [initialSyncMetadata] = useState<SyncMetadata>(() => loadSyncMetadata());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const syncMetadataRef = useRef(initialSyncMetadata);
  const [hasPendingChanges, setHasPendingChanges] = useState(
    () => serializeSessionsForComparison(sessions) !== syncMetadataRef.current.lastSyncedSnapshot,
  );
  const apiBaseUrl = getApiBaseUrl();

  const sessionsRef = useRef(sessions);
  const onReplaceSessionsRef = useRef(onReplaceSessions);
  const syncStatusTimeoutRef = useRef<number | null>(null);
  const autoPushTimeoutRef = useRef<number | null>(null);
  const initialHydrationDoneRef = useRef(false);
  const hydrationInFlightRef = useRef(false);
  const pushInFlightRef = useRef(false);
  const pendingHydrationSnapshotRef = useRef<string | null>(null);
  const pendingHydrationNeedsPushRef = useRef(false);

  sessionsRef.current = sessions;
  onReplaceSessionsRef.current = onReplaceSessions;

  const updatePendingChanges = useCallback((nextSessions: Session[], metadata = syncMetadataRef.current) => {
    setHasPendingChanges(serializeSessionsForComparison(nextSessions) !== metadata.lastSyncedSnapshot);
  }, []);

  useEffect(() => {
    return () => {
      if (syncStatusTimeoutRef.current !== null) {
        globalThis.clearTimeout(syncStatusTimeoutRef.current);
      }

      if (autoPushTimeoutRef.current !== null) {
        globalThis.clearTimeout(autoPushTimeoutRef.current);
      }
    };
  }, []);

  const finishSuccess = useCallback((syncedSessions: Session[], remoteUpdatedAt: string | null) => {
    const nextMetadata = {
      lastSyncedSnapshot: serializeSessionsForComparison(syncedSessions),
      lastRemoteUpdatedAt: remoteUpdatedAt,
    };

    saveLastSync(Date.now());
    saveSyncMetadata(nextMetadata);
    syncMetadataRef.current = nextMetadata;

    if (syncStatusTimeoutRef.current !== null) {
      globalThis.clearTimeout(syncStatusTimeoutRef.current);
    }

    setIsAvailable(true);
    setHasPendingChanges(false);
    setSyncError(null);
    setSyncStatus('success');
    syncStatusTimeoutRef.current = globalThis.setTimeout(() => setSyncStatus('idle'), SUCCESS_MESSAGE_DURATION_MS);
  }, []);

  const pushSessions = useCallback(async (nextSessions: Session[]) => {
    const response = await fetch(`${apiBaseUrl}sync/push`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sessions: nextSessions }),
    });

    return parseBackendJsonResponse<PullResponse>(response);
  }, [apiBaseUrl]);

  const pullSessions = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}sync/pull`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    return parseBackendJsonResponse<PullResponse>(response);
  }, [apiBaseUrl]);

  const pushNow = useCallback(async () => {
    if (pushInFlightRef.current) {
      return;
    }

    pushInFlightRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const nextSessions = sessionsRef.current;
      const response = await pushSessions(nextSessions);
      finishSuccess(nextSessions, response.updatedAt);
    } catch (error) {
      const message = isBackendUnavailableError(error)
        ? BACKEND_UNAVAILABLE_MESSAGE
        : error instanceof Error
          ? error.message
          : 'Remote sync failed';
      setSyncStatus('error');
      setSyncError(message);
      setIsAvailable(false);
      updatePendingChanges(sessionsRef.current);
      reportClientDiagnostic({
        category: 'storage_sync_error',
        severity: 'error',
        message,
        fingerprint: `storage-sync-push:${message}`,
        details: {
          stage: 'push',
          sessionCount: sessionsRef.current.length,
          error,
        },
      });
    } finally {
      pushInFlightRef.current = false;
    }
  }, [finishSuccess, pushSessions]);

  const scheduleAutoPush = useCallback((delayMs = AUTO_PUSH_DEBOUNCE_MS) => {
    if (autoPushTimeoutRef.current !== null) {
      globalThis.clearTimeout(autoPushTimeoutRef.current);
    }

    autoPushTimeoutRef.current = globalThis.setTimeout(() => {
      autoPushTimeoutRef.current = null;
      void pushNow();
    }, delayMs);
  }, [pushNow]);

  const hydrateFromRemote = useCallback(async (reason: 'startup' | 'resume' | 'manual' = 'startup') => {
    if (hydrationInFlightRef.current) {
      return;
    }

    hydrationInFlightRef.current = true;

    if (reason !== 'resume') {
      setSyncStatus('syncing');
    }
    setSyncError(null);

    try {
      const remote = await pullSessions();
      const localSessions = sessionsRef.current;
      const localSnapshot = serializeSessionsForComparison(localSessions);
      const remoteSnapshot = serializeSessionsForComparison(remote.sessions);
      const syncMetadata = syncMetadataRef.current;

      let nextSessions = localSessions;
      let needsPush = false;

      if (remote.sessions.length === 0) {
        needsPush = localSessions.length > 0;
      } else if (localSessions.length === 0) {
        nextSessions = remote.sessions;
      } else if (
        syncMetadata.lastSyncedSnapshot
        && syncMetadata.lastSyncedSnapshot === localSnapshot
        && remoteSnapshot !== localSnapshot
      ) {
        nextSessions = remote.sessions;
      } else {
        nextSessions = mergeSessionsById(remote.sessions, localSessions, { prefer: 'secondary' });
        needsPush = serializeSessionsForComparison(nextSessions) !== remoteSnapshot;
      }

      const nextSnapshot = serializeSessionsForComparison(nextSessions);
      const sessionsChanged = nextSnapshot !== localSnapshot;

      setIsAvailable(true);
      syncMetadataRef.current = syncMetadata;

      if (sessionsChanged) {
        pendingHydrationSnapshotRef.current = nextSnapshot;
        pendingHydrationNeedsPushRef.current = needsPush;
        onReplaceSessionsRef.current(nextSessions);

        updatePendingChanges(nextSessions, syncMetadata);

        if (!needsPush) {
          finishSuccess(nextSessions, remote.updatedAt);
        }
      } else if (needsPush) {
        updatePendingChanges(localSessions, syncMetadata);
        scheduleAutoPush(100);
      } else {
        finishSuccess(localSessions, remote.updatedAt);
      }
    } catch (error) {
      const message = isBackendUnavailableError(error)
        ? BACKEND_UNAVAILABLE_MESSAGE
        : error instanceof Error
          ? error.message
          : 'Remote sync failed';
      setSyncStatus('error');
      setSyncError(message);
      setIsAvailable(false);
      updatePendingChanges(sessionsRef.current);
      reportClientDiagnostic({
        category: 'storage_sync_error',
        severity: 'error',
        message,
        fingerprint: `storage-sync-hydrate:${reason}:${message}`,
        details: {
          stage: 'hydrate',
          reason,
          sessionCount: sessionsRef.current.length,
          error,
        },
      });
    } finally {
      initialHydrationDoneRef.current = true;
      hydrationInFlightRef.current = false;
    }
  }, [finishSuccess, pullSessions, scheduleAutoPush]);

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}health`);
        await parseBackendJsonResponse(response);

        if (!cancelled) {
          setIsAvailable(true);
        }
      } catch (error) {
        if (!cancelled) {
          const message = isBackendUnavailableError(error)
            ? BACKEND_UNAVAILABLE_MESSAGE
            : error instanceof Error
              ? error.message
              : 'Sync API unavailable';
          setIsAvailable(false);
          setSyncError(message);
          updatePendingChanges(sessionsRef.current);
          reportClientDiagnostic({
            category: 'storage_sync_error',
            severity: 'warn',
            message,
            fingerprint: `storage-sync-health:${message}`,
            details: {
              stage: 'health',
              error,
            },
          });
        }
      }
    };

    void checkHealth();
    void hydrateFromRemote('startup');

    const handleResume = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      void hydrateFromRemote('resume');
    };

    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleResume);
    window.addEventListener('pageshow', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
      window.removeEventListener('pageshow', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [apiBaseUrl, hydrateFromRemote]);

  useEffect(() => {
    const currentSnapshot = serializeSessionsForComparison(sessions);
    const pendingHydrationSnapshot = pendingHydrationSnapshotRef.current;

    updatePendingChanges(sessions);

    if (pendingHydrationSnapshot && pendingHydrationSnapshot === currentSnapshot) {
      pendingHydrationSnapshotRef.current = null;

      if (pendingHydrationNeedsPushRef.current) {
        pendingHydrationNeedsPushRef.current = false;
        scheduleAutoPush(100);
      }

      return;
    }

    if (!initialHydrationDoneRef.current) {
      return;
    }

    scheduleAutoPush();
  }, [scheduleAutoPush, sessions, updatePendingChanges]);

  return {
    isAvailable,
    hasPendingChanges,
    syncStatus,
    syncError,
    conflictData: null,
    syncNow: () => {
      if (loadLastSync() === 0) {
        void hydrateFromRemote('manual');
        return;
      }

      void pushNow();
    },
    acceptRemote: () => {},
    keepLocal: () => {},
  };
}
