import React, { useState, useEffect } from 'react';
import { Session, Step } from '../types';
import { formatTime, formatDuration } from '../utils/format';
import { Play, Pause, Check } from 'lucide-react';

export function SessionRunner({ 
  session, 
  onComplete, 
  onCancel 
}: { 
  session: Session, 
  onComplete: (session: Session) => void,
  onCancel: () => void
}) {
  const [steps, setSteps] = useState<Step[]>(session.steps);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  // Overall session stopwatch
  const [sessionTime, setSessionTime] = useState(0);
  const [isSessionRunning, setIsSessionRunning] = useState(true);
  
  // Current step countdown
  const [stepTimeLeft, setStepTimeLeft] = useState(steps[0]?.durationSeconds || 0);
  const [isStepRunning, setIsStepRunning] = useState(false);

  // Completion state
  const [isFinishing, setIsFinishing] = useState(false);
  const [anxietyScore, setAnxietyScore] = useState<0|1|2|undefined>();
  const [notes, setNotes] = useState('');

  // Session timer effect
  useEffect(() => {
    let interval: number;
    if (isSessionRunning && !isFinishing) {
      interval = window.setInterval(() => {
        setSessionTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionRunning, isFinishing]);

  // Step timer effect
  useEffect(() => {
    let interval: number;
    if (isStepRunning && stepTimeLeft > 0 && !isFinishing) {
      interval = window.setInterval(() => {
        setStepTimeLeft(t => t - 1);
      }, 1000);
    } else if (stepTimeLeft === 0 && isStepRunning) {
      setIsStepRunning(false);
    }
    return () => clearInterval(interval);
  }, [isStepRunning, stepTimeLeft, isFinishing]);

  const handleStartStep = () => {
    setIsStepRunning(true);
    setIsSessionRunning(true);
  };

  const handlePauseStep = () => {
    setIsStepRunning(false);
  };

  const handleCompleteStep = () => {
    const newSteps = [...steps];
    newSteps[currentStepIndex].completed = true;
    setSteps(newSteps);
    setIsStepRunning(false);
    
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      setStepTimeLeft(steps[currentStepIndex + 1].durationSeconds);
    } else {
      setIsFinishing(true);
      setIsSessionRunning(false);
    }
  };

  const handleFinishSession = () => {
    onComplete({
      ...session,
      steps,
      totalDurationSeconds: sessionTime,
      anxietyScore,
      notes,
      completed: true
    });
  };

  if (isFinishing) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-bold mb-8 text-gray-900 text-center">Session Complete</h2>
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-8">
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-2 font-medium uppercase tracking-wider">Total Duration</p>
              <p className="text-5xl font-mono text-indigo-600 font-light">{formatTime(sessionTime)}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500 mb-3 font-medium uppercase tracking-wider text-center">Anxiety Score</p>
              <div className="flex gap-3">
                {[
                  { score: 0, label: 'Calm', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', active: 'ring-2 ring-emerald-500 bg-emerald-100' },
                  { score: 1, label: 'Coping', color: 'bg-amber-50 text-amber-700 border-amber-200', active: 'ring-2 ring-amber-500 bg-amber-100' },
                  { score: 2, label: 'Panicking', color: 'bg-red-50 text-red-700 border-red-200', active: 'ring-2 ring-red-500 bg-red-100' }
                ].map(item => (
                  <button
                    key={item.score}
                    onClick={() => setAnxietyScore(item.score as 0|1|2)}
                    className={`flex-1 py-4 rounded-2xl border font-medium transition-all ${item.color} ${anxietyScore === item.score ? item.active : 'opacity-60 hover:opacity-100'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-2 font-medium uppercase tracking-wider">Notes (Optional)</p>
              <textarea 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full p-4 border border-gray-200 rounded-2xl h-32 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-gray-50"
                placeholder="How did the dog do?"
              />
            </div>

            <button 
              onClick={handleFinishSession}
              disabled={anxietyScore === undefined}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-200"
            >
              Save Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentStep = steps[currentStepIndex];
  const progressPercent = ((currentStep.durationSeconds - stepTimeLeft) / currentStep.durationSeconds) * 100;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Thin Background Header Stopwatch */}
      <div className="bg-indigo-900 text-indigo-100 px-4 py-3 flex justify-between items-center text-sm font-mono shadow-md z-10">
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-widest text-xs font-sans text-indigo-300 font-bold">Session Time</span>
          <span className="text-lg">{formatTime(sessionTime)}</span>
        </div>
        <button 
          onClick={() => setIsSessionRunning(!isSessionRunning)}
          className="p-1.5 rounded-md hover:bg-indigo-800 transition-colors"
        >
          {isSessionRunning ? <Pause size={18} /> : <Play size={18} />}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
        
        {/* Central Countdown Timer */}
        <div className="relative w-72 h-72 mb-12">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle 
              cx="50" cy="50" r="45" fill="none" stroke="#4f46e5" strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progressPercent / 100)}`}
              className="transition-all duration-1000 ease-linear"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
            <span className={`text-7xl font-mono font-light tracking-tighter ${stepTimeLeft === 0 ? 'text-emerald-500' : 'text-gray-900'}`}>
              {formatTime(stepTimeLeft)}
            </span>
            <span className="text-sm text-gray-400 mt-3 font-medium">
              Target: {formatDuration(currentStep.durationSeconds)}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 w-full mb-12">
          {!isStepRunning && stepTimeLeft > 0 ? (
            <button 
              onClick={handleStartStep}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-transform active:scale-95"
            >
              <Play size={24} /> Start Step
            </button>
          ) : isStepRunning ? (
            <button 
              onClick={handlePauseStep}
              className="flex-1 py-4 bg-amber-500 text-white rounded-2xl font-bold text-lg hover:bg-amber-600 flex items-center justify-center gap-2 shadow-lg shadow-amber-200 transition-transform active:scale-95"
            >
              <Pause size={24} /> Pause
            </button>
          ) : null}
          
          <button 
            onClick={handleCompleteStep}
            className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-bold text-lg hover:bg-emerald-600 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 transition-transform active:scale-95"
          >
            <Check size={24} /> {currentStepIndex < steps.length - 1 ? 'Next Step' : 'Finish'}
          </button>
        </div>

        {/* Steps List Preview */}
        <div className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-2">Upcoming Steps</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
            {steps.map((step, idx) => (
              <div 
                key={step.id} 
                className={`flex justify-between items-center p-2.5 rounded-xl text-sm transition-colors ${
                  idx === currentStepIndex ? 'bg-indigo-50 text-indigo-700 font-medium border border-indigo-100' : 
                  idx < currentStepIndex ? 'text-gray-400 line-through' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center opacity-50 font-mono">{idx + 1}</span>
                  <span>{formatDuration(step.durationSeconds)}</span>
                </div>
                {idx < currentStepIndex && <Check size={16} className="text-emerald-500" />}
                {idx === currentStepIndex && <Play size={14} className="text-indigo-500" />}
              </div>
            ))}
          </div>
        </div>

      </div>
      
      {/* Bottom Actions */}
      <div className="p-4 flex justify-between bg-white border-t border-gray-200">
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-800 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
          Cancel Session
        </button>
        <button 
          onClick={() => { setIsSessionRunning(false); setIsStepRunning(false); setIsFinishing(true); }}
          className="text-indigo-600 hover:text-indigo-800 font-medium px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          End Early
        </button>
      </div>
    </div>
  );
}
