import React, { useState } from 'react';
import { Session, Step } from '../types';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { format } from 'date-fns';
import { formatDuration } from '../utils/format';
import { DurationInput } from './DurationInput';

export function SessionEditModal({ 
  session, 
  onSave, 
  onClose 
}: { 
  session: Session, 
  onSave: (session: Session) => void,
  onClose: () => void
}) {
  const [date, setDate] = useState(format(new Date(session.date), "yyyy-MM-dd"));
  const [anxietyScore, setAnxietyScore] = useState<0|1|2|undefined>(session.anxietyScore);
  const [notes, setNotes] = useState(session.notes || '');
  const [steps, setSteps] = useState<Step[]>(session.steps);
  const [newStepDuration, setNewStepDuration] = useState(30);
  const [totalDurationSeconds, setTotalDurationSeconds] = useState(session.totalDurationSeconds);

  const handleAddStep = () => {
    if (newStepDuration <= 0) return;

    const newStep: Step = {
      id: crypto.randomUUID(),
      durationSeconds: newStepDuration,
      completed: true, // Assume completed for historical entries
    };

    setSteps([...steps, newStep]);
    setNewStepDuration(30);
  };

  const handleRemoveStep = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id));
  };

  const handleUpdateStepDuration = (id: string, duration: number) => {
    setSteps(steps.map((s) =>
      s.id === id ? { ...s, durationSeconds: duration } : s
    ));
  };

  const handleSaveClick = () => {
    onSave({ 
      ...session, 
      date: new Date(date).toISOString(),
      anxietyScore, 
      notes,
      steps,
      totalDurationSeconds,
      completed: true
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl my-8 border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white/90 backdrop-blur-md z-10 shrink-0">
          <h2 className="text-2xl font-serif font-bold text-slate-800">Edit Session</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Date</p>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-rose-400 outline-none bg-slate-50 font-medium text-slate-700"
            />
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Total Duration</p>
            <DurationInput
              valueSeconds={totalDurationSeconds}
              onChange={setTotalDurationSeconds}
              className="w-full"
            />
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Steps</p>
            <div className="space-y-3 mb-4">
              {steps.map((step, index) => (
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
              {steps.length === 0 && (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-slate-400 font-medium text-sm">No steps recorded.</p>
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
                Add
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Anxiety Score</p>
            <div className="flex gap-3">
              {[
                { score: 0, label: 'Calm', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', active: 'ring-2 ring-emerald-400 bg-emerald-100' },
                { score: 1, label: 'Coping', color: 'bg-amber-50 text-amber-700 border-amber-200', active: 'ring-2 ring-amber-400 bg-amber-100' },
                { score: 2, label: 'Panicking', color: 'bg-rose-50 text-rose-700 border-rose-200', active: 'ring-2 ring-rose-400 bg-rose-100' }
              ].map(item => (
                <button
                  key={item.score}
                  onClick={() => setAnxietyScore(item.score as 0|1|2)}
                  className={`flex-1 py-3 rounded-2xl border font-bold transition-all text-sm ${item.color} ${anxietyScore === item.score ? item.active : 'opacity-60 hover:opacity-100'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Notes</p>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any little victories?"
              className="w-full p-4 border border-slate-200 rounded-2xl h-32 resize-none focus:ring-2 focus:ring-rose-400 focus:border-transparent outline-none bg-slate-50 transition-shadow"
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-2xl transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSaveClick}
            className="px-6 py-3 bg-rose-500 text-white font-bold hover:bg-rose-600 rounded-2xl transition-colors shadow-sm hover:shadow-md"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
