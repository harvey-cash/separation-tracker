import { Session } from '../types';
import { formatDuration } from '../utils/format';
import { Play, BarChart2, History, Heart, Info } from 'lucide-react';
import { format } from 'date-fns';
import { ReactNode } from 'react';

type Props = {
  sessions: Session[];
  onStartNew: () => void;
  onViewGraph: () => void;
  onViewHistory: () => void;
  onViewInfo: () => void;
  onViewSession: (session: Session) => void;
  driveSync?: ReactNode;
};

export function Dashboard({
  sessions,
  onStartNew,
  onViewGraph,
  onViewHistory,
  onViewInfo,
  onViewSession,
  driveSync,
}: Props) {
  const completedSessions = sessions.filter((s) => s.completed);
  const recentSessions = [...completedSessions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-8">
      <header className="text-center py-10">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={onStartNew}
          className="group flex flex-col items-center justify-center gap-3 bg-rose-500 hover:bg-rose-600 text-white p-8 rounded-3xl shadow-sm hover:shadow-md transition-all"
        >
          <div className="bg-white/20 p-4 rounded-full group-hover:scale-110 transition-transform">
            <Play size={28} fill="currentColor" />
          </div>
          <span className="text-xl font-semibold">Start Training</span>
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
          <h2 className="text-xl font-serif font-bold text-slate-800">Recent Wins</h2>
        </div>

        {recentSessions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-slate-400 font-medium">No sessions yet. Every big journey begins with a small step!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSessions.map((session) => {
              const maxStep = Math.max(...session.steps.map(s => s.durationSeconds), 0);
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
                      {session.steps.filter((s) => s.completed).length} / {session.steps.length} steps completed
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

      {driveSync}
    </div>
  );
}
