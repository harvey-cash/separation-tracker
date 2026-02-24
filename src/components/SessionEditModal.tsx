import React, { useState } from 'react';
import { Session } from '../types';
import { X } from 'lucide-react';

export function SessionEditModal({ 
  session, 
  onSave, 
  onClose 
}: { 
  session: Session, 
  onSave: (session: Session) => void,
  onClose: () => void
}) {
  const [anxietyScore, setAnxietyScore] = useState<0|1|2|undefined>(session.anxietyScore);
  const [notes, setNotes] = useState(session.notes || '');

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Edit Session</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-8">
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

        <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
          <button onClick={onClose} className="px-6 py-3 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button 
            onClick={() => onSave({ ...session, anxietyScore, notes })}
            className="px-6 py-3 bg-indigo-600 text-white font-bold hover:bg-indigo-700 rounded-xl transition-colors shadow-md shadow-indigo-200"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
