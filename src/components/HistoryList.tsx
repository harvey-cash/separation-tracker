import React, { useState } from 'react';
import { Session } from '../types';
import { formatDuration } from '../utils/format';
import { format } from 'date-fns';
import { Trash2, Edit2, Plus } from 'lucide-react';
import { SessionEditModal } from './SessionEditModal';

export function HistoryList({ 
  sessions, 
  onDelete,
  onEdit,
  onAddHistorical
}: { 
  sessions: Session[], 
  onDelete: (id: string) => void,
  onEdit: (session: Session) => void,
  onAddHistorical: (session: Session) => void
}) {
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const sortedSessions = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getAnxietyColor = (score?: number) => {
    if (score === 0) return 'bg-emerald-100 text-emerald-700';
    if (score === 1) return 'bg-amber-100 text-amber-700';
    if (score === 2) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getAnxietyLabel = (score?: number) => {
    if (score === 0) return 'Calm';
    if (score === 1) return 'Coping';
    if (score === 2) return 'Panicking';
    return 'N/A';
  };

  const handleAddNew = () => {
    const newSession: Session = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      steps: [],
      totalDurationSeconds: 0,
      completed: true,
    };
    setEditingSession(newSession);
    setIsAddingNew(true);
  };

  const handleSave = (session: Session) => {
    if (isAddingNew) {
      onAddHistorical(session);
    } else {
      onEdit(session);
    }
    setEditingSession(null);
    setIsAddingNew(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <button 
          onClick={handleAddNew}
          className="flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-xl font-medium transition-colors"
        >
          <Plus size={18} /> Add Past Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium">No sessions yet. Start training!</p>
        </div>
      ) : (
        sortedSessions.map(session => {
          const maxStep = Math.max(...session.steps.map(s => s.durationSeconds), 0);
          
          return (
            <div key={session.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{format(new Date(session.date), 'MMM d, yyyy')}</h3>
                  <p className="text-sm text-gray-500 mt-1 font-medium">
                    {session.steps.length} steps • Max: {formatDuration(maxStep)} • Total: {formatDuration(session.totalDurationSeconds)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingSession(session)} className="p-2.5 text-gray-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => onDelete(session.id)} className="p-2.5 text-gray-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-50">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${getAnxietyColor(session.anxietyScore)}`}>
                  {getAnxietyLabel(session.anxietyScore)}
                </span>
                {session.notes && (
                  <span className="text-sm text-gray-600 truncate flex-1 italic">"{session.notes}"</span>
                )}
              </div>
            </div>
          );
        })
      )}

      {editingSession && (
        <SessionEditModal 
          session={editingSession} 
          onSave={handleSave} 
          onClose={() => {
            setEditingSession(null);
            setIsAddingNew(false);
          }} 
        />
      )}
    </div>
  );
}
