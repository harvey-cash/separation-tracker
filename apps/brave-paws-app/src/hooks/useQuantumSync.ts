import { useCallback, useEffect, useState } from 'react';

import type { Session } from '../types';
import { shouldUseRemoteData } from '../utils/googleDrive';
import { getApiBaseUrl } from '../config';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export type QuantumConflictData = {
  remoteSessions: Session[];
  remoteUpdatedAt: string | null;
};

type PullResponse = {
  sessions: Session[];
  updatedAt: string | null;
};

const SUCCESS_MESSAGE_DURATION_MS = 3000;
const LAST_SYNC_KEY = 'brave_paws_quantum_last_sync_ms';

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
  const [conflictData, setConflictData] = useState<QuantumConflictData | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const apiBaseUrl = getApiBaseUrl();

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

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const finishSuccess = useCallback(() => {
    saveLastSync(Date.now());
    setIsAvailable(true);
    setSyncError(null);
    setSyncStatus('success');
    globalThis.setTimeout(() => setSyncStatus('idle'), SUCCESS_MESSAGE_DURATION_MS);
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

  const syncNow = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncError(null);

    try {
      const remote = await pullSessions();
      const remoteModifiedMs = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
      const lastSyncMs = loadLastSync();

      if (
        remote.sessions.length > 0
        && shouldUseRemoteData({
          lastSyncMs,
          remoteModifiedMs,
          localSessions: sessions,
          remoteSessions: remote.sessions,
        })
      ) {
        setConflictData({
          remoteSessions: remote.sessions,
          remoteUpdatedAt: remote.updatedAt,
        });
        setSyncStatus('idle');
        return;
      }

      await pushSessions(sessions);
      finishSuccess();
    } catch (error) {
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'QUANTUM sync failed');
      setIsAvailable(false);
    }
  }, [finishSuccess, pullSessions, pushSessions, sessions]);

  const acceptRemote = useCallback(() => {
    if (!conflictData) {
      return;
    }

    onReplaceSessions(conflictData.remoteSessions);
    setConflictData(null);
    finishSuccess();
  }, [conflictData, finishSuccess, onReplaceSessions]);

  const keepLocal = useCallback(async () => {
    if (!conflictData) {
      return;
    }

    setSyncStatus('syncing');
    setSyncError(null);

    try {
      await pushSessions(sessions);
      setConflictData(null);
      finishSuccess();
    } catch (error) {
      setSyncStatus('error');
      setSyncError(error instanceof Error ? error.message : 'QUANTUM sync failed');
    }
  }, [conflictData, finishSuccess, pushSessions, sessions]);

  return {
    isAvailable,
    syncStatus,
    syncError,
    conflictData,
    syncNow,
    acceptRemote,
    keepLocal,
  };
}
