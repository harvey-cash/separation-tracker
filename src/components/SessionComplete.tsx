import { useState } from 'react';
import { Session } from '../types';
import { Save, Smile, Meh, Frown, Sparkles } from 'lucide-react';

type Props = {
  session: Session;
  onSave: (session: Session) => void;
};

export function SessionComplete({ session, onSave }: Props) {
  const [score, setScore] = useState<0 | 1 | 2 | undefined>(session.anxietyScore);
  const [notes, setNotes] = useState(session.notes || '');

  const handleSave = () => {
    if (score === undefined) return;
    onSave({
      ...session,
      anxietyScore: score,
      notes,
      completed: true,
    });
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-8 min-h-screen flex flex-col justify-center">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center p-3 bg-rose-100 text-rose-500 rounded-full mb-2">
          <Sparkles size={32} />
        </div>
        <h1 className="text-4xl font-serif font-bold text-slate-800">Session Complete</h1>
        <p className="text-slate-500 italic">How did your brave pup do today?</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 space-y-8">
        <div>
          <label className="block text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">
            Anxiety Score
          </label>
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => setScore(0)}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                score === 0
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-600 scale-105 shadow-sm'
                  : 'border-slate-100 hover:border-emerald-200 text-slate-400 hover:text-emerald-500'
              }`}
            >
              <Smile size={32} />
              <span className="font-bold text-sm">Calm</span>
            </button>
            <button
              onClick={() => setScore(1)}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                score === 1
                  ? 'border-amber-400 bg-amber-50 text-amber-600 scale-105 shadow-sm'
                  : 'border-slate-100 hover:border-amber-200 text-slate-400 hover:text-amber-500'
              }`}
            >
              <Meh size={32} />
              <span className="font-bold text-sm">Coping</span>
            </button>
            <button
              onClick={() => setScore(2)}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                score === 2
                  ? 'border-rose-400 bg-rose-50 text-rose-600 scale-105 shadow-sm'
                  : 'border-slate-100 hover:border-rose-200 text-slate-400 hover:text-rose-500'
              }`}
            >
              <Frown size={32} />
              <span className="font-bold text-sm">Panicking</span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any little victories to celebrate?"
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none transition-shadow"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={score === undefined}
        className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-200 text-white p-5 rounded-3xl shadow-sm hover:shadow-md transition-all text-xl font-bold"
      >
        <Save size={24} />
        Save Session
      </button>
    </div>
  );
}
