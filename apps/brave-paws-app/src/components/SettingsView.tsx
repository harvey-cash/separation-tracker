import { ArrowLeft, Cog, Wifi } from 'lucide-react';

import type { AppSettings, LongestStepAutoIncrementMode } from '../settings';
import { BackendConnectionSettings } from './BackendConnectionSettings';

type Props = {
  settings: AppSettings;
  currentBackendRootUrl: string | null;
  isBackendAvailable: boolean;
  onBack: () => void;
  onBackendRootUrlChange: (backendRootUrl: string | null) => void;
  onBackendVersionChange?: (backendVersion: string | null) => void;
  onSettingsChange: (settings: AppSettings) => void;
};

export function SettingsView({
  settings,
  currentBackendRootUrl,
  isBackendAvailable,
  onBack,
  onBackendRootUrlChange,
  onBackendVersionChange,
  onSettingsChange,
}: Props) {
  const incrementMode = settings.longestDepartureIncrement.mode;
  const incrementValue = settings.longestDepartureIncrement.value;

  const handleModeChange = (mode: LongestStepAutoIncrementMode) => {
    onSettingsChange({
      ...settings,
      longestDepartureIncrement: {
        ...settings.longestDepartureIncrement,
        mode,
      },
    });
  };

  const handleValueChange = (rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    onSettingsChange({
      ...settings,
      longestDepartureIncrement: {
        ...settings.longestDepartureIncrement,
        value: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
      },
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between py-6">
        <button
          onClick={onBack}
          className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-serif font-bold text-slate-800">Settings</h1>
          <p className="text-sm text-slate-500 mt-1 italic">Tweak how Brave Paws behaves on this device.</p>
        </div>
        <div className="w-12" />
      </header>

      <section className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-rose-100 p-2.5 text-rose-500">
            <Cog size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Training defaults</h2>
            <p className="mt-1 text-sm text-slate-500">
              When you start a new session from your latest history, Brave Paws can gently extend the longest planned departure automatically.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400" htmlFor="longest-departure-mode">
            Longest departure auto-increment
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <select
              id="longest-departure-mode"
              value={incrementMode}
              onChange={(event) => handleModeChange(event.target.value as LongestStepAutoIncrementMode)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
            >
              <option value="minutes">Minutes</option>
              <option value="percentage">Percentage</option>
            </select>
            <div className="space-y-2">
              <input
                id="longest-departure-value"
                type="number"
                min="0"
                step="1"
                value={Number.isFinite(incrementValue) ? String(incrementValue) : '0'}
                onChange={(event) => handleValueChange(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-rose-300 focus:bg-white focus:ring-2 focus:ring-rose-100"
                aria-describedby="longest-departure-help"
              />
              <p id="longest-departure-help" className="text-xs text-slate-500">
                {incrementMode === 'percentage'
                  ? 'Adds this percentage to the longest planned step from your last session, then rounds the new duration to the nearest 5 seconds.'
                  : 'Adds this many minutes to the longest planned step from your last session when you start a new one.'}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Saved automatically on this device.
          </div>
        </div>
      </section>

      <section className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-sky-100 p-2.5 text-sky-600">
            <Wifi size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Backend connection</h2>
            <p className="mt-1 text-sm text-slate-500">
              Point this browser at the Brave Paws backend you want to use for sync, live camera controls, and recordings.
            </p>
          </div>
        </div>

        <BackendConnectionSettings
          currentBackendRootUrl={currentBackendRootUrl}
          isBackendAvailable={isBackendAvailable}
          onBackendRootUrlChange={onBackendRootUrlChange}
          onBackendVersionChange={onBackendVersionChange}
        />
      </section>
    </div>
  );
}
