import { Session } from '../types';
import { formatDuration } from '../utils/format';
import { Play, BarChart2, History, Download } from 'lucide-react';
import { format } from 'date-fns';

type Props = {
  sessions: Session[];
  onStartNew: () => void;
  onViewGraph: () => void;
  onViewHistory: () => void;
  onExportCSV: () => void;
  onExportHTML: () => void;
};

export function Dashboard({
  sessions,
  onStartNew,
  onViewGraph,
  onViewHistory,
  onExportCSV,
  onExportHTML,
}: Props) {
  const completedSessions = sessions.filter((s) => s.completed);
  const recentSessions = [...completedSessions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <header className="text-center py-6">
        <h1 className="text-3xl font-bold text-slate-800">CSA Tracker</h1>
        <p className="text-slate-500 mt-2">Canine Separation Anxiety Protocol</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={onStartNew}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-2xl shadow-sm transition-colors"
        >
          <Play size={24} />
          <span className="text-xl font-semibold">Start New Session</span>
        </button>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onViewGraph}
            className="flex flex-col items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 p-4 rounded-2xl shadow-sm border border-slate-100 transition-colors"
          >
            <BarChart2 size={24} className="text-indigo-500" />
            <span className="font-medium">Progress Graph</span>
          </button>
          <button
            onClick={onViewHistory}
            className="flex flex-col items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 p-4 rounded-2xl shadow-sm border border-slate-100 transition-colors"
          >
            <History size={24} className="text-indigo-500" />
            <span className="font-medium">History</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-slate-800">Recent Sessions</h2>
          <div className="flex gap-2">
            <button
              onClick={onExportCSV}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Export CSV"
            >
              <Download size={20} />
            </button>
            <button
              onClick={onExportHTML}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Export HTML"
            >
              <Download size={20} />
            </button>
          </div>
        </div>

        {recentSessions.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No completed sessions yet.</p>
        ) : (
          <div className="space-y-3">
            {recentSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-4 rounded-xl bg-slate-50"
              >
                <div>
                  <div className="font-medium text-slate-800">
                    {format(new Date(session.date), 'MMM d, yyyy')}
                  </div>
                  <div className="text-sm text-slate-500">
                    {session.steps.filter((s) => s.completed).length} / {session.steps.length} steps completed
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-slate-800">
                    {formatDuration(session.totalDurationSeconds)}
                  </div>
                  <div className="text-sm text-slate-500">
                    Score: {session.anxietyScore !== undefined ? session.anxietyScore : '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
