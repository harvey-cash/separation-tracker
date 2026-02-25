import { Session } from '../types';
import { formatDuration } from '../utils/format';
import { Play, BarChart2, History, Download, Heart } from 'lucide-react';
import { format } from 'date-fns';

type Props = {
  sessions: Session[];
  onStartNew: () => void;
  onViewGraph: () => void;
  onViewHistory: () => void;
  onViewSession: (session: Session) => void;
};

export function Dashboard({
  sessions,
  onStartNew,
  onViewGraph,
  onViewHistory,
  onViewSession,
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
    </div>
  );
}
