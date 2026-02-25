import { useState } from 'react';
import { Session, Step } from '../types';
import { Plus, Trash2, Play, ArrowLeft, GripVertical, Sparkles } from 'lucide-react';
import { formatDuration } from '../utils/format';
import { DurationInput } from './DurationInput';

type Props = {
  initialSession: Session;
  onStart: (session: Session) => void;
  onCancel: () => void;
};

export function SessionConfig({ initialSession, onStart, onCancel }: Props) {
  const [session, setSession] = useState<Session>(initialSession);
  const [newStepDuration, setNewStepDuration] = useState(30);

  const handleAddStep = () => {
    if (newStepDuration <= 0) return;

    const newStep: Step = {
      id: crypto.randomUUID(),
      durationSeconds: newStepDuration,
      completed: false,
    };

    setSession((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep],
    }));
    setNewStepDuration(30);
  };

  const handleRemoveStep = (id: string) => {
    setSession((prev) => ({
      ...prev,
      steps: prev.steps.filter((s) => s.id !== id),
    }));
  };

  const handleUpdateStepDuration = (id: string, duration: number) => {
    setSession((prev) => ({
      ...prev,
      steps: prev.steps.map((s) =>
        s.id === id ? { ...s, durationSeconds: duration } : s
      ),
    }));
  };

  const handleStart = () => {
    if (session.steps.length === 0) return;
    onStart(session);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between py-6">
        <button
          onClick={onCancel}
          className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-serif font-bold text-slate-800">Plan Today's Training</h1>
          <p className="text-sm text-slate-500 mt-1 italic">Set them up for success.</p>
        </div>
        <div className="w-12" />
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="text-amber-400" size={20} />
          <h2 className="text-lg font-bold text-slate-800">Training Steps</h2>
        </div>
        
        <div className="space-y-3 mb-8">
          {session.steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors group"
            >
              <div className="text-slate-300 cursor-grab group-hover:text-slate-400">
                <GripVertical size={20} />
              </div>
              <span className="font-bold text-slate-400 w-8">#{index + 1}</span>
              <DurationInput
                valueSeconds={step.durationSeconds}
                onChange={(duration) => handleUpdateStepDuration(step.id, duration)}
                className="flex-1"
              />
              <span className="text-slate-500 w-16 text-right text-sm font-medium">
                {formatDuration(step.durationSeconds)}
              </span>
              <button
                onClick={() => handleRemoveStep(step.id)}
                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
          
          {session.steps.length === 0 && (
            <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-400 font-medium">No steps yet. Add one below!</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <DurationInput
            valueSeconds={newStepDuration}
            onChange={setNewStepDuration}
            className="flex-1"
          />
          <button
            onClick={handleAddStep}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl transition-colors font-medium"
          >
            <Plus size={20} />
            Add Step
          </button>
        </div>
      </div>

      <button
        onClick={handleStart}
        disabled={session.steps.length === 0}
        className="w-full flex items-center justify-center gap-3 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-200 text-white p-5 rounded-3xl shadow-sm hover:shadow-md transition-all text-xl font-bold"
      >
        <Play size={24} fill="currentColor" />
        Let's Go!
      </button>
    </div>
  );
}
