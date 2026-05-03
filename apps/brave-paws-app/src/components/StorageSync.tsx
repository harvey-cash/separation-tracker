import { Cloud, CloudOff, HardDrive, Loader2, RefreshCw, Check, AlertCircle, Server } from 'lucide-react';

import type { StorageProviderId, StorageProviderState } from '../hooks/useStorageSync';

type Props = {
  providers: StorageProviderState[];
  selectedProviderId: StorageProviderId;
  onSelectProvider: (providerId: StorageProviderId) => void;
};

export function StorageSync({ providers, selectedProviderId, onSelectProvider }: Props) {
  const selected = providers.find((provider) => provider.id === selectedProviderId) ?? providers[0];

  return (
    <section className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Storage</p>
          <h2 className="mt-2 text-xl font-serif font-bold text-slate-800">Backup &amp; Sync</h2>
          <p className="mt-1 text-sm text-slate-500">Choose how Brave Paws stores browser data and where you want it synced.</p>
        </div>
        <StatusBadge provider={selected} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {providers.map((provider) => {
          const isSelected = provider.id === selectedProviderId;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => onSelectProvider(provider.id)}
              className={`rounded-2xl border p-4 text-left transition-colors ${isSelected ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'}`}
            >
              <div className="flex items-center gap-2 text-slate-700">
                {provider.id === 'local-only' ? <HardDrive size={16} /> : provider.id === 'quantum-api' ? <Server size={16} /> : <Cloud size={16} />}
                <span className="font-semibold">{provider.label}</span>
              </div>
              {provider.badge && (
                <span className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {provider.badge}
                </span>
              )}
              <p className="mt-3 text-xs text-slate-500">{provider.summary}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">{selected.label}</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">{selected.summary}</p>
          </div>
          {selected.id === 'google-drive' && selected.isConnected !== undefined && (
            <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${selected.isConnected ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
              {selected.isConnected ? <Cloud size={13} /> : <CloudOff size={13} />}
              {selected.isConnected ? 'Connected' : 'Disconnected'}
            </div>
          )}
        </div>

        {!selected.isAvailable && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>This provider is not currently available.</span>
          </div>
        )}

        {selected.error && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{selected.error}</span>
          </div>
        )}

        {selected.conflictData && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Remote data is newer</p>
            <p className="mt-1 text-xs text-amber-800">
              The selected provider has a newer copy of your training history ({selected.conflictData.remoteSessions.length} sessions).
              Choose whether to pull the remote copy or overwrite it with the current browser copy.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selected.onAcceptRemote}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Use Remote Data
              </button>
              <button
                type="button"
                onClick={selected.onKeepLocal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 transition-colors"
              >
                Keep Local Data
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {selected.canConnect && !selected.isConnected && selected.onConnect && (
            <button
              type="button"
              onClick={selected.onConnect}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Cloud size={15} />
              Connect
            </button>
          )}

          {selected.isConnected && selected.onDisconnect && (
            <button
              type="button"
              onClick={selected.onDisconnect}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors"
            >
              <CloudOff size={15} />
              Disconnect
            </button>
          )}

          {selected.onSyncNow && selected.isAvailable && (selected.id !== 'google-drive' || selected.isConnected) && (
            <button
              type="button"
              onClick={selected.onSyncNow}
              disabled={selected.status === 'syncing'}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 transition-colors disabled:cursor-not-allowed disabled:bg-rose-200"
            >
              {selected.status === 'syncing' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Sync Now
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ provider }: { provider: StorageProviderState }) {
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
      <HardDrive size={13} /> Ready
    </span>
  );
}
