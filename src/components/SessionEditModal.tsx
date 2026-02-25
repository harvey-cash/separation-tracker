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

  const handleSave = () => {
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl my-8">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-gray-900">Edit Session</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
          <div>
            <p className="text-xs text-gray-500 mb-3 font-bold uppercase tracking-widest">Date</p>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-3 font-bold uppercase tracking-widest">Total Duration</p>
            <DurationInput
              valueSeconds={totalDurationSeconds}
              onChange={setTotalDurationSeconds}
              className="w-full"
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-3 font-bold uppercase tracking-widest">Steps</p>
            <div className="space-y-3 mb-4">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <div className="text-slate-400">
                    <GripVertical size={20} />
                  </div>
                  <span className="font-medium text-slate-500 w-8">#{index + 1}</span>
                  <DurationInput
                    valueSeconds={step.durationSeconds}
                    onChange={(duration) => handleUpdateStepDuration(step.id, duration)}
                    className="flex-1"
                  />
                  <span className="text-slate-500 w-16 text-right text-sm">
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
              <DurationInput
                valueSeconds={newStepDuration}
                onChange={setNewStepDuration}
                className="flex-1"
              />
              <button
                onClick={handleAddStep}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-3 rounded-xl transition-colors font-medium"
              >
                <Plus size={20} />
                Add
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-3 font-bold uppercase tracking-widest">Anxiety Score</p>
            <div className="flex gap-3">
              {[
                { score: 0, label: 'Calm', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', active: 'ring-2 ring-emerald-500 bg-emerald-100' },
                { score: 1, label: 'Coping', color: 'bg-amber-50 text-amber-700 border-amber-200', active: 'ring-2 ring-amber-500 bg-amber-100' },
                { score: 2, label: 'Panicking', color: 'bg-red-50 text-red-700 border-red-200', active: 'ring-2 ring-red-500 bg-red-100' }
              ].map(item => (
                <button
                  key={item.score}
                  onClick={() => setAnxietyScore(item.score as 0|1|2)}
                  className={`flex-1 py-3 rounded-xl border font-medium transition-all text-sm ${item.color} ${anxietyScore === item.score ? item.active : 'opacity-60 hover:opacity-100'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-3 font-bold uppercase tracking-widest">Notes</p>
            <textarea 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-4 border border-gray-200 rounded-2xl h-32 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-gray-50"
            />
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 sticky bottom-0">
          <button onClick={onClose} className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-3 bg-indigo-600 text-white font-bold hover:bg-indigo-700 rounded-xl transition-colors shadow-md shadow-indigo-200"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
