import { Camera, LoaderCircle, Power, RefreshCcw } from 'lucide-react';

import type { CameraStreamingControlState } from '../hooks/useCameraStreamingControl';

type Props = {
  control: CameraStreamingControlState;
};

export function CameraStreamingControl({ control }: Props) {
  const { capability, error, isLoading, isUpdating, refresh, toggle } = control;
  const isSupported = capability.supported && capability.canSetEnabled;
  const statusLabel = capability.enabled === true ? 'On' : capability.enabled === false ? 'Off' : 'Unknown';
  const primaryLabel = capability.enabled === true ? 'Turn camera off' : 'Turn camera on';

  return (
    <section className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-rose-100 p-2.5 text-rose-500">
          <Camera size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{capability.label}</p>
              <h2 className="text-xl font-serif font-bold text-slate-800">Camera streaming</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${capability.enabled === true ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {isLoading ? 'Checking…' : statusLabel}
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-500">
            {isSupported
              ? 'Turn the live camera stream on before training, or switch it off when you only need the history.'
              : capability.detail || 'This backend does not currently expose camera streaming control.'}
          </p>

          {error && (
            <p className="mt-2 text-sm text-amber-700">{error}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => {
            void toggle();
          }}
          disabled={!isSupported || isLoading || isUpdating}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {isUpdating ? <LoaderCircle size={16} className="animate-spin" /> : <Power size={16} />}
          <span>{isUpdating ? 'Updating…' : primaryLabel}</span>
        </button>

        <button
          onClick={() => {
            void refresh().catch(() => {
              // The inline error state already reflects the failure.
            });
          }}
          disabled={isLoading || isUpdating}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
        >
          <RefreshCcw size={16} />
          <span>Refresh state</span>
        </button>
      </div>
    </section>
  );
}
