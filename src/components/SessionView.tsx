import React, { useState, useEffect } from 'react';
import { Session, Step } from '../types';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Activity, Calendar, FileText, Heart, Edit2, Check, X, Plus, Trash2, GripVertical } from 'lucide-react';
import { format } from 'date-fns';
import { formatDuration } from '../utils/format';
import { DurationInput } from './DurationInput';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type Props = {
  session: Session;
  allSessions: Session[];
  onBack: () => void;
  onNavigate: (session: Session) => void;
  onSave: (session: Session) => void;
};

export function SessionView({ session, allSessions, onBack, onNavigate, onSave }: Props) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [draftDate, setDraftDate] = useState(format(new Date(session.date), "yyyy-MM-dd"));
  const [draftAnxietyScore, setDraftAnxietyScore] = useState<0|1|2|undefined>(session.anxietyScore);
  const [draftNotes, setDraftNotes] = useState(session.notes || '');
  const [draftSteps, setDraftSteps] = useState<Step[]>(session.steps);
  const [draftTotalDuration, setDraftTotalDuration] = useState(session.totalDurationSeconds);
  const [newStepDuration, setNewStepDuration] = useState(30);

  // Reset draft state when session changes
  useEffect(() => {
    setDraftDate(format(new Date(session.date), "yyyy-MM-dd"));
    setDraftAnxietyScore(session.anxietyScore);
    setDraftNotes(session.notes || '');
    setDraftSteps(session.steps);
    setDraftTotalDuration(session.totalDurationSeconds);
    setIsEditing(false);
  }, [session]);

  // Sort sessions chronologically
  const sortedSessions = [...allSessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const currentIndex = sortedSessions.findIndex(s => s.id === session.id);
  
  const prevSession = currentIndex > 0 ? sortedSessions[currentIndex - 1] : null;
  const nextSession = currentIndex < sortedSessions.length - 1 ? sortedSessions[currentIndex + 1] : null;

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd || isEditing) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && nextSession) {
      onNavigate(nextSession);
    }
    if (isRightSwipe && prevSession) {
      onNavigate(prevSession);
    }
  };

  const handleSave = () => {
    onSave({
      ...session,
      date: new Date(draftDate).toISOString(),
      anxietyScore: draftAnxietyScore,
      notes: draftNotes,
      steps: draftSteps,
      totalDurationSeconds: draftTotalDuration,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraftDate(format(new Date(session.date), "yyyy-MM-dd"));
    setDraftAnxietyScore(session.anxietyScore);
    setDraftNotes(session.notes || '');
    setDraftSteps(session.steps);
    setDraftTotalDuration(session.totalDurationSeconds);
    setIsEditing(false);
  };

  const handleAddStep = () => {
    if (newStepDuration <= 0) return;
    const newStep: Step = {
      id: crypto.randomUUID(),
      durationSeconds: newStepDuration,
      completed: true,
    };
    setDraftSteps([...draftSteps, newStep]);
    setNewStepDuration(30);
  };

  const handleRemoveStep = (id: string) => {
    setDraftSteps(draftSteps.filter((s) => s.id !== id));
  };

  const handleUpdateStepDuration = (id: string, duration: number) => {
    setDraftSteps(draftSteps.map((s) =>
      s.id === id ? { ...s, durationSeconds: duration } : s
    ));
  };

  const maxStep = Math.max(...session.steps.map(s => s.durationSeconds), 0);
  
  const chartData = session.steps.map((step, index) => ({
    step: `Step ${index + 1}`,
    duration: step.durationSeconds,
    completed: step.completed
  }));

  const getAnxietyLabel = (score?: number) => {
    if (score === 0) return { label: 'Calm', color: 'text-emerald-600 bg-emerald-50' };
    if (score === 1) return { label: 'Coping', color: 'text-amber-600 bg-amber-50' };
    if (score === 2) return { label: 'Panicking', color: 'text-rose-600 bg-rose-50' };
    return { label: 'Unrated', color: 'text-slate-600 bg-slate-50' };
  };

  const anxietyInfo = getAnxietyLabel(session.anxietyScore);

  return (
    <div 
      className="max-w-4xl mx-auto p-4 space-y-6 min-h-screen flex flex-col"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEndHandler}
    >
      <header className="flex items-center justify-between py-6">
        <button
          onClick={isEditing ? handleCancel : onBack}
          className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
        >
          {isEditing ? <X size={24} /> : <ArrowLeft size={24} />}
        </button>
        <div className="text-center flex-1 px-4">
          <h1 className="text-2xl font-serif font-bold text-slate-800">
            {isEditing ? 'Edit Session' : 'Session Details'}
          </h1>
          {!isEditing && (
            <p className="text-sm text-slate-500 mt-1 font-medium">{format(new Date(session.date), 'MMMM d, yyyy')}</p>
          )}
        </div>
        <div className="w-24 flex justify-end gap-1">
          {isEditing ? (
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-4 py-2 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors shadow-sm"
            >
              <Check size={18} /> Save
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
                title="Edit Session"
              >
                <Edit2 size={20} />
              </button>
              <button
                onClick={() => prevSession && onNavigate(prevSession)}
                disabled={!prevSession}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={() => nextSession && onNavigate(nextSession)}
                disabled={!nextSession}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}
        </div>
      </header>

      {isEditing ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-8">
          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Date</p>
            <input 
              type="date" 
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className="w-full p-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-rose-400 outline-none bg-slate-50 font-medium text-slate-700"
            />
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Total Duration</p>
            <DurationInput
              valueSeconds={draftTotalDuration}
              onChange={setDraftTotalDuration}
              className="w-full"
            />
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Steps</p>
            <div className="space-y-3 mb-4">
              {draftSteps.map((step, index) => (
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
              {draftSteps.length === 0 && (
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
                  onClick={() => setDraftAnxietyScore(item.score as 0|1|2)}
                  className={`flex-1 py-3 rounded-2xl border font-bold transition-all text-sm ${item.color} ${draftAnxietyScore === item.score ? item.active : 'opacity-60 hover:opacity-100'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-3 font-bold uppercase tracking-widest">Notes</p>
            <textarea 
              value={draftNotes}
              onChange={e => setDraftNotes(e.target.value)}
              placeholder="Any little victories?"
              className="w-full p-4 border border-slate-200 rounded-2xl h-32 resize-none focus:ring-2 focus:ring-rose-400 focus:border-transparent outline-none bg-slate-50 transition-shadow"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
          <Clock className="text-rose-400 mb-2" size={24} />
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Max Duration</p>
          <p className="text-xl font-bold text-slate-800">{formatDuration(maxStep)}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
          <Activity className="text-rose-400 mb-2" size={24} />
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Total Time</p>
          <p className="text-xl font-bold text-slate-800">{formatDuration(session.totalDurationSeconds)}</p>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
          <Calendar className="text-rose-400 mb-2" size={24} />
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Steps</p>
          <p className="text-xl font-bold text-slate-800">{session.steps.filter(s => s.completed).length} / {session.steps.length}</p>
        </div>
        <div className={`p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center ${anxietyInfo.color}`}>
          <Heart className="mb-2 opacity-80" size={24} fill="currentColor" />
          <p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">Anxiety</p>
          <p className="text-xl font-bold">{anxietyInfo.label}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 h-[400px] flex flex-col">
        <h2 className="text-lg font-bold text-slate-800 mb-6">Step Durations</h2>
        
        {session.steps.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <p className="font-medium">No steps recorded for this session.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="step"
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
                  tickFormatter={(value) => `${value}s`}
                />
                <Tooltip
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #f1f5f9', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)',
                    padding: '12px 16px',
                    fontWeight: 500
                  }}
                  formatter={(value: number) => [`${value} s`, 'Duration']}
                  labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                />
                <Line
                  type="monotone"
                  dataKey="duration"
                  stroke="#fb7185"
                  strokeWidth={4}
                  dot={{ r: 5, fill: '#fb7185', strokeWidth: 3, stroke: '#fff' }}
                  activeDot={{ r: 7, strokeWidth: 0, fill: '#f43f5e' }}
                  animationDuration={1000}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {session.notes && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="text-rose-400" size={20} />
            <h2 className="text-lg font-bold text-slate-800">Notes</h2>
          </div>
          <p className="text-slate-600 italic leading-relaxed">"{session.notes}"</p>
        </div>
      )}
      </>
      )}
      
      {!isEditing && (
        <div className="h-8" /> // Spacer
      )}
    </div>
  );
}
