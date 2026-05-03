import { useMemo, useState } from 'react';

import type { Session } from '../types';
import { useGoogleDrive } from './useGoogleDrive';
import { useQuantumSync } from './useQuantumSync';

export type StorageProviderId = 'local-only' | 'quantum-api' | 'google-drive';
export type GenericSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export type StorageConflictData = {
  remoteSessions: Session[];
  remoteUpdatedAt?: string | null;
};

export type StorageProviderState = {
  id: StorageProviderId;
  label: string;
  summary: string;
  badge?: string;
  status: GenericSyncStatus;
  error: string | null;
  isAvailable: boolean;
  isConnected?: boolean;
  conflictData: StorageConflictData | null;
  canConnect: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSyncNow?: () => void;
  onAcceptRemote?: () => void;
  onKeepLocal?: () => void;
};

const STORAGE_PROVIDER_KEY = 'brave_paws_storage_provider';

function loadSelectedProvider(): StorageProviderId {
  if (typeof localStorage === 'undefined') {
    return 'quantum-api';
  }

  const stored = localStorage.getItem(STORAGE_PROVIDER_KEY);
  if (stored === 'local-only' || stored === 'quantum-api' || stored === 'google-drive') {
    return stored;
  }

  return 'quantum-api';
}

function persistSelectedProvider(value: StorageProviderId) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_PROVIDER_KEY, value);
}

export function useStorageSync(
  sessions: Session[],
  onReplaceSessions: (sessions: Session[]) => void,
) {
  const [selectedProviderId, setSelectedProviderIdState] = useState<StorageProviderId>(() => loadSelectedProvider());
  const googleDrive = useGoogleDrive(sessions, onReplaceSessions);
  const quantum = useQuantumSync(sessions, onReplaceSessions);

  const providers = useMemo<Record<StorageProviderId, StorageProviderState>>(() => ({
    'local-only': {
      id: 'local-only',
      label: 'Local only',
      summary: 'Keep everything in this browser only. No remote sync.',
      status: 'idle',
      error: null,
      isAvailable: true,
      conflictData: null,
      canConnect: false,
    },
    'quantum-api': {
      id: 'quantum-api',
      label: 'QUANTUM sync',
      summary: 'Save inspectable session history to the local Tailnet backend on QUANTUM.',
      badge: 'Default',
      status: quantum.syncStatus,
      error: quantum.syncError,
      isAvailable: quantum.isAvailable,
      conflictData: quantum.conflictData,
      canConnect: false,
      onSyncNow: quantum.syncNow,
      onAcceptRemote: quantum.acceptRemote,
      onKeepLocal: quantum.keepLocal,
    },
    'google-drive': {
      id: 'google-drive',
      label: 'Google Drive',
      summary: 'Legacy backup provider kept for migration and export compatibility.',
      badge: 'Legacy',
      status: googleDrive.syncStatus,
      error: googleDrive.syncError,
      isAvailable: googleDrive.isClientIdConfigured,
      isConnected: googleDrive.isConnected,
      conflictData: googleDrive.conflictData,
      canConnect: true,
      onConnect: googleDrive.connect,
      onDisconnect: googleDrive.disconnect,
      onSyncNow: googleDrive.syncNow,
      onAcceptRemote: googleDrive.acceptRemote,
      onKeepLocal: googleDrive.keepLocal,
    },
  }), [googleDrive, quantum]);

  const setSelectedProviderId = (value: StorageProviderId) => {
    persistSelectedProvider(value);
    setSelectedProviderIdState(value);
  };

  return {
    selectedProviderId,
    setSelectedProviderId,
    selectedProvider: providers[selectedProviderId],
    providerList: [providers['quantum-api'], providers['local-only'], providers['google-drive']] as StorageProviderState[],
  };
}
