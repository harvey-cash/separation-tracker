import { useMemo } from 'react';

import type { Session } from '../types';
import { useQuantumSync, type QuantumConflictData, type SyncStatus } from './useQuantumSync';

export type StorageProviderId = 'backend-api';
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
  hasPendingChanges: boolean;
  onSyncNow?: () => void;
};

export function useStorageSync(
  sessions: Session[],
  onReplaceSessions: (sessions: Session[]) => void,
) {
  const remoteSync = useQuantumSync(sessions, onReplaceSessions);

  const provider = useMemo<StorageProviderState>(() => ({
    id: 'backend-api',
    label: 'Automatic sync',
    summary: 'Keeps session history on this device and syncs with a connected server in the background.',
    badge: remoteSync.isAvailable ? 'Automatic' : 'Local first',
    status: remoteSync.syncStatus,
    error: remoteSync.syncError,
    isAvailable: remoteSync.isAvailable,
    conflictData: remoteSync.conflictData,
    hasPendingChanges: remoteSync.hasPendingChanges,
    onSyncNow: remoteSync.syncNow,
  }), [remoteSync]);

  return {
    provider,
  };
}
