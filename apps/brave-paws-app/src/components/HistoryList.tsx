import React, { useState, useRef } from 'react';
import { Session } from '../types';
import { formatDuration } from '../utils/format';
import { format } from 'date-fns';
import { Trash2, Edit2, Plus, CalendarHeart, Download, Upload } from 'lucide-react';
import { SessionEditModal } from './SessionEditModal';

export function HistoryList({ 
  sessions, 
  onDelete,
  onEdit,
  onAddHistorical,
  onExportCSV,
  onImportCSV,
  onViewSession
}: { 
  sessions: Session[], 
  onDelete: (id: string) => void,
  onEdit: (session: Session) => void,
  onAddHistorical: (session: Session) => void,
  onExportCSV: () => void,
  onImportCSV: (csvContent: string) => void,
  onViewSession: (session: Session) => void
}) {
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedSessions = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getAnxietyColor = (score?: number) => {
    if (score === 0) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (score === 1) return 'bg-amber-100 text-amber-700 border-amber-200';
    if (score === 2) return 'bg-rose-100 text-rose-700 border-rose-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getAnxietyLabel = (score?: number) => {
    if (score === 0) return 'Calm';
    if (score === 1) return 'Coping';
    if (score === 2) return 'Panicking';
    return 'Unrated';
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        onImportCSV(content);
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={onExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-2xl font-medium transition-all shadow-sm"
            title="Export to CSV"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-2xl font-medium transition-all shadow-sm"
            title="Import from CSV"
          >
            <Upload size={18} />
            <span className="hidden sm:inline">Import CSV</span>
          </button>
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        <button 
          onClick={handleAddNew}
          className="flex items-center gap-2 bg-rose-50 text-rose-600 hover:bg-rose-100 px-5 py-2.5 rounded-2xl font-bold transition-colors shadow-sm"
        >
          <Plus size={18} /> Add Past Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center">
          <CalendarHeart size={48} className="text-rose-200 mb-4" />
          <p className="text-slate-500 font-medium">No sessions yet. Your journey begins today!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedSessions.map(session => {
            const maxStep = Math.max(...session.steps.map(s => s.durationSeconds), 0);
            
            return (
              <div 
                key={session.id} 
                onClick={() => onViewSession(session)}
                className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow group cursor-pointer"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{format(new Date(session.date), 'MMM d, yyyy')}</h3>
                    <p className="text-sm text-slate-500 mt-1 font-medium">
                      {session.steps.length} steps • Max: {formatDuration(maxStep)}
                    </p>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSession(session);
                      }} 
                      className="p-2.5 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(session.id);
                      }} 
                      className="p-2.5 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-50">
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${getAnxietyColor(session.anxietyScore)}`}>
                    {getAnxietyLabel(session.anxietyScore)}
                  </span>
                  {session.notes && (
                    <span className="text-sm text-slate-500 truncate flex-1 italic">"{session.notes}"</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
