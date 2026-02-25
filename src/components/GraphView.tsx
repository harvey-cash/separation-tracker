import { Session } from '../types';
import { ArrowLeft, TrendingUp } from 'lucide-react';
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
      <header className="flex items-center justify-between py-6">
        <button
          onClick={onBack}
          className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-serif font-bold text-slate-800">Growth Journey</h1>
          <p className="text-sm text-slate-500 mt-1 italic">Look how far you've come.</p>
        </div>
        <div className="w-12" />
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 h-[500px] flex flex-col">
        <div className="flex items-center gap-2 mb-8">
          <TrendingUp className="text-emerald-400" size={24} />
          <h2 className="text-lg font-bold text-slate-800">Max Independence Time</h2>
        </div>
        
        {data.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <TrendingUp size={48} className="text-slate-200 mb-4" />
            <p className="font-medium">Your progress will bloom here soon.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                  tickMargin={16}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                  tickMargin={16}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value}m`}
                />
                <Tooltip
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #f1f5f9', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)',
                    padding: '12px 16px',
                    fontWeight: 500
                  }}
                  formatter={(value: number) => [`${value} min`, 'Max Duration']}
                  labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                />
                <Line
                  type="monotone"
                  dataKey="maxDurationMinutes"
                  stroke="#fb7185"
                  strokeWidth={4}
                  dot={{ r: 5, fill: '#fb7185', strokeWidth: 3, stroke: '#fff' }}
                  activeDot={{ r: 7, strokeWidth: 0, fill: '#f43f5e' }}
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
