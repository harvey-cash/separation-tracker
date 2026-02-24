import React, { useState } from 'react';
import { Step } from '../types';
import { formatDuration } from '../utils/format';
import { Plus, Trash2, Play, GripVertical, ArrowLeft } from 'lucide-react';

export function SessionSetup({ initialSteps, onStart, onCancel }: { initialSteps: Step[], onStart: (steps: Step[]) => void, onCancel: () => void }) {
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [newDuration, setNewDuration] = useState('');

  const addStep = () => {
    const duration = parseInt(newDuration, 10);
    if (!isNaN(duration) && duration > 0) {
      setSteps([...steps, { id: crypto.randomUUID(), durationSeconds: duration, completed: false }]);
      setNewDuration('');
    }
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStepDuration = (id: string, duration: number) => {
    setSteps(steps.map(s => s.id === id ? { ...s, durationSeconds: duration } : s));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onCancel} className="p-2 bg-white rounded-xl shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-2xl font-bold text-gray-900">Setup Session</h2>
        </div>
        
        <div className="space-y-3 mb-6">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
              <div className="text-gray-400"><GripVertical size={20} /></div>
              <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-medium text-sm">
                {index + 1}
              </div>
              <input 
                type="number" 
                value={step.durationSeconds}
                onChange={(e) => updateStepDuration(step.id, parseInt(e.target.value) || 0)}
                className="flex-1 w-20 p-2 border border-gray-200 rounded-lg text-center font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-sm text-gray-500 w-12 text-right">{formatDuration(step.durationSeconds)}</span>
              <button onClick={() => removeStep(step.id)} className="text-red-400 hover:text-red-600 p-2 transition-colors">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-8 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
          <input 
            type="number" 
            placeholder="Duration (s)" 
            value={newDuration}
            onChange={(e) => setNewDuration(e.target.value)}
            className="flex-1 p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && addStep()}
          />
          <button onClick={addStep} className="px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 font-medium transition-colors">
            <Plus size={20} /> Add
          </button>
        </div>

        <button 
          onClick={() => steps.length > 0 && onStart(steps)}
          disabled={steps.length === 0}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
        >
          <Play size={24} /> Start Session
        </button>
      </div>
    </div>
  );
}
