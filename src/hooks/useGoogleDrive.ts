import { useState, useEffect, useCallback } from 'react';
import {
  DriveTokens,
  saveTokens,
  loadTokens,
  clearTokens,
  saveFolderId,
  loadFolderId,
  saveLastSync,
  loadLastSync,
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  findOrCreateFolder,
  findFile,
  uploadFile,
  downloadFile,
  CODE_VERIFIER_KEY,
} from '../utils/googleDrive';
import { Session } from '../types';
import { generateCSVContent, parseCSV } from '../utils/export';

/** Duration (ms) to show the "Synced" success badge before returning to idle. */
const SUCCESS_MESSAGE_DURATION_MS = 3000;

// Access Vite env at runtime. A `vite-env.d.ts` provides the proper type for
// build-time checking; the double cast here guards against environments where
// that augmentation isn't present.
const CLIENT_ID = (import.meta as unknown as { env: Record<string, string> }).env
  .VITE_GOOGLE_CLIENT_ID as string | undefined;

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export type ConflictData = {
  remoteSessions: Session[];
};

export function useGoogleDrive(
  sessions: Session[],
  onReplaceSessions: (sessions: Session[]) => void,
) {
  const [tokens, setTokens] = useState<DriveTokens | null>(() => loadTokens());
  const [folderId, setFolderId] = useState<string | null>(() => loadFolderId());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);

  const isConnected = tokens !== null;

  // ── Handle OAuth redirect callback ────────────────────────────────────────
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (!code) return;

    // The code verifier is stored in sessionStorage (not localStorage) so it
    // survives the redirect but is not accessible across tabs or persisted
    // beyond the browser session.
    const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
    if (!codeVerifier || !CLIENT_ID) return;

    const redirectUri = `${window.location.origin}${window.location.pathname}`;

    // Clean up URL
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('scope');
    window.history.replaceState({}, '', url.toString());
    sessionStorage.removeItem(CODE_VERIFIER_KEY);

    (async () => {
      try {
        const newTokens = await exchangeCodeForTokens(code, CLIENT_ID, redirectUri, codeVerifier);
        saveTokens(newTokens);
        setTokens(newTokens);
      } catch (e) {
        console.error('Token exchange failed', e);
        setSyncError('Authentication failed. Please try connecting again.');
        setSyncStatus('error');
      }
    })();
  }, []);

  // ── Get a valid access token (refresh if needed) ───────────────────────────
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (!tokens) return null;

    if (Date.now() < tokens.expires_at) {
      return tokens.access_token;
    }

    if (!tokens.refresh_token || !CLIENT_ID) {
      clearTokens();
      setTokens(null);
      return null;
    }

    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token, CLIENT_ID);
      const updated: DriveTokens = {
        ...refreshed,
        refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
      };
      saveTokens(updated);
      setTokens(updated);
      return updated.access_token;
    } catch {
      clearTokens();
      setTokens(null);
      setSyncError('Session expired. Please reconnect Google Drive.');
      setSyncStatus('error');
      return null;
    }
  }, [tokens]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!CLIENT_ID) {
      setSyncError('Google Drive integration is not available.');
      setSyncStatus('error');
      return;
    }
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    // Store verifier in sessionStorage so it survives the OAuth redirect.
    sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
    const redirectUri = `${window.location.origin}${window.location.pathname}`;
    window.location.href = buildAuthUrl(CLIENT_ID, redirectUri, challenge);
  }, []);

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    clearTokens();
    setTokens(null);
    setFolderId(null);
    setSyncStatus('idle');
    setSyncError(null);
    setConflictData(null);
  }, []);

  // ── Core sync logic ────────────────────────────────────────────────────────
  const performUpload = useCallback(
    async (accessToken: string, currentFolderId: string) => {
      const remoteFile = await findFile(accessToken, currentFolderId);

      if (remoteFile) {
        const remoteModifiedMs = new Date(remoteFile.modifiedTime).getTime();
        const lastSyncMs = loadLastSync();

        if (remoteModifiedMs > lastSyncMs) {
          // Remote was updated since our last sync — prompt conflict resolution
          const remoteCSV = await downloadFile(accessToken, remoteFile.id);
          const remoteSessions = parseCSV(remoteCSV);
          setConflictData({ remoteSessions });
          setSyncStatus('idle');
          return;
        }

        // Remote is not newer — overwrite it with local data
        const csv = generateCSVContent(sessions);
        await uploadFile(accessToken, currentFolderId, remoteFile.id, csv);
      } else {
        // No remote file yet — create it
        const csv = generateCSVContent(sessions);
        await uploadFile(accessToken, currentFolderId, null, csv);
      }

      saveLastSync(Date.now());
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), SUCCESS_MESSAGE_DURATION_MS);
    },
    [sessions],
  );

  const syncNow = useCallback(async () => {
    const accessToken = await getValidToken();
    if (!accessToken) {
      setSyncError('Not connected to Google Drive.');
      setSyncStatus('error');
      return;
    }

    setSyncStatus('syncing');
    setSyncError(null);

    try {
      let currentFolderId = folderId;
      if (!currentFolderId) {
        currentFolderId = await findOrCreateFolder(accessToken);
        saveFolderId(currentFolderId);
        setFolderId(currentFolderId);
      }

      await performUpload(accessToken, currentFolderId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      setSyncError(msg);
      setSyncStatus('error');

      // 401 → token is no longer valid, force re-auth on next connect
      if (msg.includes('401')) {
        clearTokens();
        setTokens(null);
      }
    }
  }, [getValidToken, folderId, performUpload]);

  // ── Conflict resolution ────────────────────────────────────────────────────
  const acceptRemote = useCallback(() => {
    if (!conflictData) return;
    onReplaceSessions(conflictData.remoteSessions);
    saveLastSync(Date.now());
    setConflictData(null);
    setSyncStatus('success');
    setTimeout(() => setSyncStatus('idle'), SUCCESS_MESSAGE_DURATION_MS);
  }, [conflictData, onReplaceSessions]);

  const keepLocal = useCallback(async () => {
    if (!conflictData) return;
    setConflictData(null);
    // Force-upload local data, bypassing the conflict check
    const accessToken = await getValidToken();
    if (!accessToken || !folderId) return;
    setSyncStatus('syncing');
    try {
      const remoteFile = await findFile(accessToken, folderId);
      const csv = generateCSVContent(sessions);
      await uploadFile(accessToken, folderId, remoteFile?.id ?? null, csv);
      saveLastSync(Date.now());
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), SUCCESS_MESSAGE_DURATION_MS);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
      setSyncStatus('error');
    }
  }, [conflictData, getValidToken, folderId, sessions]);

  return {
    isClientIdConfigured: !!CLIENT_ID,
    isConnected,
    syncStatus,
    syncError,
    conflictData,
    connect,
    disconnect,
    syncNow,
    acceptRemote,
    keepLocal,
  };
}
