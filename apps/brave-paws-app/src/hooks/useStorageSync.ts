import { useMemo } from 'react';

import type { Session } from '../types';
import { useQuantumSync, type QuantumConflictData, type SyncStatus } from './useQuantumSync';

export type StorageProviderId = 'quantum-api';
export type GenericSyncStatus = SyncStatus;

export type StorageConflictData = QuantumConflictData;

export type StorageProviderState = {
  id: StorageProviderId;
  label: string;
  summary: string;
  badge?: string;
  status: GenericSyncStatus;
  error: string | null;
  isAvailable: boolean;
  conflictData: StorageConflictData | null;
  onSyncNow?: () => void;
};

export function useStorageSync(
  sessions: Session[],
  onReplaceSessions: (sessions: Session[]) => void,
) {
  const quantum = useQuantumSync(sessions, onReplaceSessions);

  const provider = useMemo<StorageProviderState>(() => ({
    id: 'quantum-api',
    label: 'QUANTUM sync',
    summary: 'Loads history from QUANTUM when the app opens and automatically saves session changes back to QUANTUM.',
    badge: 'Automatic',
    status: quantum.syncStatus,
    error: quantum.syncError,
    isAvailable: quantum.isAvailable,
    conflictData: quantum.conflictData,
    onSyncNow: quantum.syncNow,
  }), [quantum]);

  return {
    provider,
  };
}
