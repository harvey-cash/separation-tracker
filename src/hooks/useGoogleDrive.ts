import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DriveTokens,
  saveTokens,
  loadTokens,
  clearTokens,
  saveFolderId,
  loadFolderId,
  saveLastSync,
  loadLastSync,
  tokensFromGISResponse,
  findOrCreateFolder,
  findFile,
  uploadFile,
  downloadFile,
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
  const tokenClientRef = useRef<TokenClient | null>(null);

  const isConnected = tokens !== null;

  // ── Initialise the GIS token client once the library has loaded ───────────
  useEffect(() => {
    if (!CLIENT_ID) return;

    // The GIS script loads asynchronously; poll briefly until it's available.
    const tryInit = () => {
      if (typeof google === 'undefined' || !google?.accounts?.oauth2) return false;

      tokenClientRef.current = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response: TokenResponse) => {
          if (response.error !== undefined) {
            console.error('GIS auth error:', response.error);
            setSyncError(`Authentication failed: ${response.error_description ?? response.error}`);
            setSyncStatus('error');
            return;
          }

          const newTokens = tokensFromGISResponse(response.access_token, response.expires_in);
          saveTokens(newTokens);
          setTokens(newTokens);
        },
        error_callback: (err) => {
          // Popup closed or blocked — only surface if user expects a result.
          if (err.type === 'popup_closed') return;
          console.error('GIS error:', err);
          setSyncError('Could not open the Google sign-in popup.');
          setSyncStatus('error');
        },
      });
      return true;
    };

    if (tryInit()) return;

    const MAX_INIT_ATTEMPTS = 25; // ~5 seconds at 200 ms intervals
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryInit() || attempts >= MAX_INIT_ATTEMPTS) clearInterval(interval);
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // ── Get a valid access token (re-prompt via GIS if expired) ────────────────
  const getValidToken = useCallback(async (): Promise<string | null> => {
    if (!tokens) return null;

    if (Date.now() < tokens.expires_at) {
      return tokens.access_token;
    }

    // Token expired — need to re-authenticate via GIS popup.
    // This requires user gesture, so we can't silently refresh.
    clearTokens();
    setTokens(null);
    setSyncError('Session expired. Please reconnect Google Drive.');
    setSyncStatus('error');
    return null;
  }, [tokens]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!CLIENT_ID) {
      setSyncError('Google Drive integration is not available.');
      setSyncStatus('error');
      return;
    }
    if (!tokenClientRef.current) {
      setSyncError('Google sign-in is still loading. Please try again.');
      setSyncStatus('error');
      return;
    }

    // Opens the Google consent popup; the callback above handles the response.
    tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
  }, []);

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    // Best-effort revoke of the access token so the user sees a clean consent next time.
    if (tokens?.access_token && typeof google !== 'undefined' && google?.accounts?.oauth2) {
      try {
        google.accounts.oauth2.revoke(tokens.access_token, () => {
          /* revocation done — local state already cleared below */
        });
      } catch (e) {
        console.warn('Token revocation failed:', e);
      }
    }
    clearTokens();
    setTokens(null);
    setFolderId(null);
    setSyncStatus('idle');
    setSyncError(null);
    setConflictData(null);
  }, [tokens]);

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
