import { useCallback, useEffect, useRef, useState } from 'react';

import type { Session } from '../types';
import { getApiBaseUrl } from '../config';
import { mergeSessionsById, serializeSessionsForComparison } from '../utils/sessionSync';

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
const LAST_SYNC_KEY = 'brave_paws_quantum_last_sync_ms';
const SYNC_METADATA_KEY = 'brave_paws_quantum_sync_meta';

function loadLastSync(): number {
  if (typeof localStorage === 'undefined') {
    return 0;
  }

  const raw = localStorage.getItem(LAST_SYNC_KEY);
  return raw ? Number.parseInt(raw, 10) || 0 : 0;
}

function saveLastSync(timestampMs: number) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(LAST_SYNC_KEY, String(timestampMs));
}

function loadSyncMetadata(): SyncMetadata {
  if (typeof localStorage === 'undefined') {
    return {
      lastSyncedSnapshot: '',
      lastRemoteUpdatedAt: null,
    };
  }

  try {
    const raw = localStorage.getItem(SYNC_METADATA_KEY);
    if (!raw) {
      return {
        lastSyncedSnapshot: '',
        lastRemoteUpdatedAt: null,
      };
    }

    const parsed = JSON.parse(raw) as Partial<SyncMetadata>;
    return {
      lastSyncedSnapshot: typeof parsed.lastSyncedSnapshot === 'string' ? parsed.lastSyncedSnapshot : '',
      lastRemoteUpdatedAt: typeof parsed.lastRemoteUpdatedAt === 'string' ? parsed.lastRemoteUpdatedAt : null,
    };
  } catch {
    return {
      lastSyncedSnapshot: '',
      lastRemoteUpdatedAt: null,
    };
  }
}

function saveSyncMetadata(metadata: SyncMetadata) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify(metadata));
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export function useQuantumSync(
  sessions: Session[],
  onReplaceSessions: (sessions: Session[]) => void,
) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const apiBaseUrl = getApiBaseUrl();

  const sessionsRef = useRef(sessions);
  const syncStatusTimeoutRef = useRef<number | null>(null);
  const autoPushTimeoutRef = useRef<number | null>(null);
  const initialHydrationDoneRef = useRef(false);
  const hydrationInFlightRef = useRef(false);
  const pushInFlightRef = useRef(false);
  const pendingHydrationSnapshotRef = useRef<string | null>(null);
  const pendingHydrationNeedsPushRef = useRef(false);

  sessionsRef.current = sessions;

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
    saveLastSync(Date.now());
    saveSyncMetadata({
      lastSyncedSnapshot: serializeSessionsForComparison(syncedSessions),
      lastRemoteUpdatedAt: remoteUpdatedAt,
    });

    if (syncStatusTimeoutRef.current !== null) {
      globalThis.clearTimeout(syncStatusTimeoutRef.current);
    }

    setIsAvailable(true);
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

    return parseJsonResponse<PullResponse>(response);
  }, [apiBaseUrl]);

  const pullSessions = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}sync/pull`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    return parseJsonResponse<PullResponse>(response);
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
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'QUANTUM sync failed');
      setIsAvailable(false);
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
      const syncMetadata = loadSyncMetadata();

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

      if (sessionsChanged) {
        pendingHydrationSnapshotRef.current = nextSnapshot;
        pendingHydrationNeedsPushRef.current = needsPush;
        onReplaceSessions(nextSessions);

        if (!needsPush) {
          finishSuccess(nextSessions, remote.updatedAt);
        }
      } else if (needsPush) {
        scheduleAutoPush(100);
      } else {
        finishSuccess(localSessions, remote.updatedAt);
      }
    } catch (error) {
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'QUANTUM sync failed');
      setIsAvailable(false);
    } finally {
      initialHydrationDoneRef.current = true;
      hydrationInFlightRef.current = false;
    }
  }, [finishSuccess, onReplaceSessions, pullSessions, scheduleAutoPush]);

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}health`);
        if (!response.ok) {
          throw new Error(`QUANTUM API unavailable (${response.status})`);
        }

        if (!cancelled) {
          setIsAvailable(true);
        }
      } catch (error) {
        if (!cancelled) {
          setIsAvailable(false);
          setSyncError(error instanceof Error ? error.message : 'QUANTUM API unavailable');
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
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [apiBaseUrl, hydrateFromRemote]);

  useEffect(() => {
    const currentSnapshot = serializeSessionsForComparison(sessions);
    const pendingHydrationSnapshot = pendingHydrationSnapshotRef.current;

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
  }, [scheduleAutoPush, sessions]);

  return {
    isAvailable,
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
