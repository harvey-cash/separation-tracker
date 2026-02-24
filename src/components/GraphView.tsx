import { Session } from '../types';
import { ArrowLeft } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

type Props = {
  sessions: Session[];
  onBack: () => void;
};

export function GraphView({ sessions, onBack }: Props) {
  const completedSessions = sessions
    .filter((s) => s.completed)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const data = completedSessions.map((session) => {
    const maxDuration = Math.max(
      0,
      ...session.steps.filter((s) => s.completed).map((s) => s.durationSeconds)
    );
    return {
      date: format(new Date(session.date), 'MMM d'),
      maxDurationMinutes: parseFloat((maxDuration / 60).toFixed(2)),
      score: session.anxietyScore,
    };
  });

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between py-4">
        <button
          onClick={onBack}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">Progress Graph</h1>
        <div className="w-10" />
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 h-[500px]">
        <h2 className="text-lg font-semibold text-slate-800 mb-6">Max Step Duration Over Time</h2>
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            No completed sessions to display.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="80%">
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickMargin={10}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickMargin={10}
                label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: '#64748b' }}
              />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`${value} min`, 'Max Duration']}
              />
              <Line
                type="monotone"
                dataKey="maxDurationMinutes"
                stroke="#6366f1"
                strokeWidth={3}
                dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
