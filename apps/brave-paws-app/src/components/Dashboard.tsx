import { Session } from '../types';
import { formatDuration } from '../utils/format';
import { Play, BarChart2, History, Heart, Info, Server, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { ReactNode } from 'react';
import { getAbortedStepCount, getCompletedStepCount, getRecordedStepDurationSeconds } from '../utils/sessionStatus';

type Props = {
  sessions: Session[];
  onStartNew: () => void;
  onViewGraph: () => void;
  onViewHistory: () => void;
  onViewInfo: () => void;
  onViewSettings: () => void;
  onViewSession: (session: Session) => void;
  cameraStreamingControl?: ReactNode;
  storageSync?: ReactNode;
  isBackendUnavailable?: boolean;
};

export function getRecentSessions(sessions: Session[]) {
  return [...sessions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
}

export function Dashboard({
  sessions,
  onStartNew,
  onViewGraph,
  onViewHistory,
  onViewInfo,
  onViewSettings,
  onViewSession,
  cameraStreamingControl,
  storageSync,
  isBackendUnavailable = false,
}: Props) {
  const abortedSessions = sessions.filter((s) => s.status === 'aborted');
  const recentSessions = getRecentSessions(sessions);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-8">
      <header className="relative text-center py-10">
        <button
          onClick={onViewSettings}
          aria-label="Settings"
          className="absolute right-0 top-6 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-3 text-slate-500 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
        >
          <Settings size={20} />
        </button>
        <div className="inline-flex items-center justify-center p-3 bg-rose-100 text-rose-500 rounded-full mb-4">
          <Heart size={32} fill="currentColor" />
        </div>
        <h1 className="text-4xl font-serif font-bold text-slate-800 tracking-tight">Brave Paws</h1>
        <p className="text-slate-500 mt-3 font-medium italic">Celebrating every second of independence.</p>
      </header>

      {recentSessions.length === 0 && (
        <button
          onClick={onViewInfo}
          className="w-full flex items-center gap-5 bg-white hover:bg-rose-50 text-left p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-100 hover:border-rose-100 transition-all"
        >
          <div className="bg-rose-100 text-rose-500 p-4 rounded-2xl shrink-0">
            <Info size={28} />
          </div>
          <div>
            <h2 className="text-lg font-serif font-bold text-slate-800">New to separation anxiety training?</h2>
            <p className="text-slate-500 text-sm mt-1">Learn how gradual desensitisation works and how Brave Paws can help your dog.</p>
          </div>
        </button>
      )}

      {isBackendUnavailable && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Remote features unavailable</p>
          <p className="mt-2 text-sm text-amber-900">
            Training still works locally on this device. Sessions stay saved here and sync automatically when the server is reachable again.
            Live camera controls, recordings, and remote sync are unavailable from this network right now.
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={onStartNew}
          className="group flex flex-col items-center justify-center gap-3 bg-rose-500 hover:bg-rose-600 text-white p-8 rounded-3xl shadow-sm hover:shadow-md transition-all"
        >
          <div className="bg-white/20 p-4 rounded-full group-hover:scale-110 transition-transform">
            <Play size={28} fill="currentColor" />
          </div>
          <span className="text-xl font-semibold">Start Training</span>
          {isBackendUnavailable && (
            <span className="text-center text-sm font-medium text-rose-50/90">Works locally now · syncs later when the server is back</span>
          )}
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onViewGraph}
            className="flex flex-col items-center justify-center gap-3 bg-white hover:bg-rose-50 text-slate-700 p-6 rounded-3xl shadow-sm border border-slate-100 hover:border-rose-100 transition-all"
          >
            <div className="bg-rose-100 text-rose-500 p-3 rounded-2xl">
              <BarChart2 size={24} />
            </div>
            <span className="font-medium">Progress</span>
          </button>
          <button
            onClick={onViewHistory}
            className="flex flex-col items-center justify-center gap-3 bg-white hover:bg-rose-50 text-slate-700 p-6 rounded-3xl shadow-sm border border-slate-100 hover:border-rose-100 transition-all"
          >
            <div className="bg-rose-100 text-rose-500 p-3 rounded-2xl">
              <History size={24} />
            </div>
            <span className="font-medium">History</span>
          </button>
        </div>
      </div>

      {cameraStreamingControl}

      {recentSessions.length > 0 && (
        <button
          onClick={onViewInfo}
          className="flex items-center justify-center gap-2 text-slate-400 hover:text-rose-500 transition-colors text-sm font-medium"
        >
          <Info size={16} />
          <span>About separation anxiety training</span>
        </button>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-serif font-bold text-slate-800">Recent Sessions</h2>
          {sessions.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {sessions.length} total {abortedSessions.length > 0 ? `• ${abortedSessions.length} aborted` : ''}
            </p>
          )}
        </div>

        {recentSessions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-slate-400 font-medium">No sessions yet. Every big journey begins with a small step!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSessions.map((session) => {
              const maxStep = Math.max(...session.steps.map((step) => getRecordedStepDurationSeconds(step)), 0);
              return (
                <div
                  key={session.id}
                  onClick={() => onViewSession(session)}
                  className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-slate-800">
                      {format(new Date(session.date), 'MMM d, yyyy')}
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {getCompletedStepCount(session.steps)} completed • {getAbortedStepCount(session.steps)} aborted
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-rose-500">
                      {formatDuration(maxStep)} max
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {session.anxietyScore === 0 ? 'Calm' : session.anxietyScore === 1 ? 'Coping' : session.anxietyScore === 2 ? 'Panicking' : 'Unrated'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {storageSync}

      <section className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Connected features</p>
        <div className="mt-2 flex items-start gap-3">
          <div className="rounded-2xl bg-rose-100 p-2.5 text-rose-500">
            <Server size={18} />
          </div>
          <p className="text-sm text-slate-500">
            When a compatible server is available, Brave Paws can add automatic sync, pairing-aware camera previews,
            remote camera control, and session recording without a separate companion app.
          </p>
        </div>
      </section>

      <p className="text-center text-xs text-slate-300 pb-2">v{__APP_VERSION__}</p>
    </div>
  );
}
