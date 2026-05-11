import { type ReactNode } from 'react';
import { AlertCircle, Check, Loader2, RefreshCw, Server } from 'lucide-react';

import type { StorageProviderState } from '../hooks/useStorageSync';

type Props = {
  provider: StorageProviderState;
  backendConnection?: ReactNode;
};

export function StorageSync({ provider, backendConnection }: Props) {
  return (
    <section className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Storage</p>
          <h2 className="mt-2 text-xl font-serif font-bold text-slate-800">Connected sync</h2>
          <p className="mt-1 text-sm text-slate-500">
            Brave Paws keeps history on this device and syncs with a connected backend when one is available.
            Recent sessions hydrate on app open and changes are pushed back automatically.
          </p>
        </div>
        <StatusBadge provider={provider} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-rose-100 p-2.5 text-rose-500">
            <Server size={18} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-800 text-sm">{provider.label}</h3>
              {provider.badge && (
                <span className="inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {provider.badge}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">{provider.summary}</p>
          </div>
        </div>

        {!provider.isAvailable && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>
              {provider.hasPendingChanges
                ? 'New or edited sessions are saved locally on this device and will sync automatically when the server is reachable again.'
                : 'The backend is not reachable right now, but your sessions are still being stored locally on this device.'}
            </span>
          </div>
        )}

        {provider.error && provider.isAvailable && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{provider.error}</span>
          </div>
        )}

        <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">Saved locally first</div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">Syncs on reconnect</div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">Refreshes after saves and imports</div>
        </div>

        {backendConnection}

        {provider.onSyncNow && provider.isAvailable ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={provider.onSyncNow}
              disabled={provider.status === 'syncing'}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 transition-colors disabled:cursor-not-allowed disabled:bg-rose-200"
            >
              {provider.status === 'syncing' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Sync now
            </button>
          </div>
        ) : provider.hasPendingChanges ? (
          <p className="text-xs font-medium text-amber-700">Waiting for the server so pending sessions can sync.</p>
        ) : null}
      </div>
    </section>
  );
}

function StatusBadge({ provider }: { provider: StorageProviderState }) {
  if (!provider.isAvailable) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        <AlertCircle size={13} /> {provider.hasPendingChanges ? 'Stored locally' : 'Local only'}
      </span>
    );
  }

  if (provider.status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        <Check size={13} /> Synced
      </span>
    );
  }

  if (provider.status === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
        <Loader2 size={13} className="animate-spin" /> Syncing
      </span>
    );
  }

  if (provider.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
        <AlertCircle size={13} /> Error
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
      <Server size={13} /> Ready
    </span>
  );
}
