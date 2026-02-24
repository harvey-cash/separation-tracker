import { useState } from 'react';
import { Session, Step } from '../types';
import { Plus, Trash2, Play, ArrowLeft, GripVertical } from 'lucide-react';
import { formatDuration } from '../utils/format';

type Props = {
  initialSession: Session;
  onStart: (session: Session) => void;
  onCancel: () => void;
};

export function SessionConfig({ initialSession, onStart, onCancel }: Props) {
  const [session, setSession] = useState<Session>(initialSession);
  const [newStepDuration, setNewStepDuration] = useState('30');

  const handleAddStep = () => {
    const duration = parseInt(newStepDuration, 10);
    if (isNaN(duration) || duration <= 0) return;

    const newStep: Step = {
      id: crypto.randomUUID(),
      durationSeconds: duration,
      completed: false,
    };

    setSession((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep],
    }));
    setNewStepDuration('');
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
      <header className="flex items-center justify-between py-4">
        <button
          onClick={onCancel}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">Configure Session</h1>
        <div className="w-10" />
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Steps</h2>
        
        <div className="space-y-3 mb-6">
          {session.steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
            >
              <div className="text-slate-400 cursor-grab">
                <GripVertical size={20} />
              </div>
              <span className="font-medium text-slate-500 w-8">#{index + 1}</span>
              <input
                type="number"
                value={step.durationSeconds}
                onChange={(e) =>
                  handleUpdateStepDuration(step.id, parseInt(e.target.value, 10) || 0)
                }
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="1"
              />
              <span className="text-slate-500 w-16 text-right">
                {formatDuration(step.durationSeconds)}
              </span>
              <button
                onClick={() => handleRemoveStep(step.id)}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <input
            type="number"
            value={newStepDuration}
            onChange={(e) => setNewStepDuration(e.target.value)}
            placeholder="Duration in seconds"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            min="1"
            onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
          />
          <button
            onClick={handleAddStep}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl transition-colors font-medium"
          >
            <Plus size={20} />
            Add Step
          </button>
        </div>
      </div>

      <button
        onClick={handleStart}
        disabled={session.steps.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white p-4 rounded-2xl shadow-sm transition-colors text-lg font-semibold"
      >
        <Play size={24} />
        Start Session
      </button>
    </div>
  );
}
