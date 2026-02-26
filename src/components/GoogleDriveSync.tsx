import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { SyncStatus, ConflictData } from '../hooks/useGoogleDrive';

type Props = {
  isClientIdConfigured: boolean;
  isConnected: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  conflictData: ConflictData | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncNow: () => void;
  onAcceptRemote: () => void;
  onKeepLocal: () => void;
  onSetClientId: (id: string) => void;
};

export function GoogleDriveSync({
  isClientIdConfigured,
  isConnected,
  syncStatus,
  syncError,
  conflictData,
  onConnect,
  onDisconnect,
  onSyncNow,
  onAcceptRemote,
  onKeepLocal,
  onSetClientId,
}: Props) {
  const [clientIdInput, setClientIdInput] = useState('');

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-2xl ${isConnected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
            {isConnected ? <Cloud size={20} /> : <CloudOff size={20} />}
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Google Drive Backup</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isConnected ? 'Connected — your data syncs to your Drive' : 'Back up your sessions to Google Drive'}
            </p>
          </div>
        </div>

        {isClientIdConfigured && (
          isConnected ? (
            <div className="flex items-center gap-2">
              <SyncStatusBadge status={syncStatus} />
              <button
                onClick={onSyncNow}
                disabled={syncStatus === 'syncing'}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sync now"
              >
                {syncStatus === 'syncing' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                <span className="hidden sm:inline">Sync Now</span>
              </button>
              <button
                onClick={onDisconnect}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-sm font-medium transition-colors"
                title="Disconnect Google Drive"
              >
                <CloudOff size={15} />
                <span className="hidden sm:inline">Disconnect</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onConnect}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              <Cloud size={15} />
              Connect Drive
            </button>
          )
        )}
      </div>

      {!isClientIdConfigured && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-slate-500">
            Enter your{' '}
            <a
              href="https://console.developers.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google OAuth Client ID
            </a>{' '}
            to enable Drive backup.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={() => {
                const trimmed = clientIdInput.trim();
                if (trimmed) {
                  onSetClientId(trimmed);
                  setClientIdInput('');
                }
              }}
              disabled={!clientIdInput.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {syncError && (
        <div className="flex items-start gap-2 mt-3 p-3 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{syncError}</span>
        </div>
      )}

      {conflictData && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <p className="text-sm font-semibold text-amber-800 mb-1">Cloud data is newer</p>
          <p className="text-xs text-amber-700 mb-3">
            Google Drive has a more recent version ({conflictData.remoteSessions.length} sessions).
            Would you like to overwrite your local data with the cloud version?
          </p>
          <div className="flex gap-2">
            <button
              onClick={onAcceptRemote}
              className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Use Cloud Data
            </button>
            <button
              onClick={onKeepLocal}
              className="flex-1 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors"
            >
              Keep Local Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <Check size={13} /> Synced
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
        <AlertCircle size={13} /> Error
      </span>
    );
  }
  if (status === 'syncing') {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-500 font-medium">
        <Loader2 size={13} className="animate-spin" /> Syncing…
      </span>
    );
  }
  return null;
}
