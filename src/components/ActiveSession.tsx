import { useState, useEffect, useRef } from 'react';
import { Session, Step } from '../types';
import { Play, Pause, CheckCircle2, Circle, Flag, X } from 'lucide-react';
import { formatTime, formatDuration } from '../utils/format';

type Props = {
  session: Session;
  onCompleteSession: (session: Session) => void;
  onCancel: () => void;
};

export function ActiveSession({ session: initialSession, onCompleteSession, onCancel }: Props) {
  const [session, setSession] = useState<Session>(initialSession);
  
  // Overall session stopwatch
  const [isSessionRunning, setIsSessionRunning] = useState(true);
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Current step countdown
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isStepRunning, setIsStepRunning] = useState(false);
  const [stepRemaining, setStepRemaining] = useState(
    session.steps[0]?.durationSeconds || 0
  );

  const sessionTimerRef = useRef<number | null>(null);
  const stepTimerRef = useRef<number | null>(null);

  // Background Stopwatch
  useEffect(() => {
    if (isSessionRunning) {
      sessionTimerRef.current = window.setInterval(() => {
        setSessionElapsed((prev) => prev + 1);
      }, 1000);
    } else if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [isSessionRunning]);

  // Step Countdown
  useEffect(() => {
    if (isStepRunning && stepRemaining > 0) {
      stepTimerRef.current = window.setInterval(() => {
        setStepRemaining((prev) => {
          if (prev <= 1) {
            setIsStepRunning(false);
            handleStepComplete(currentStepIndex);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
    }
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, [isStepRunning, stepRemaining, currentStepIndex]);

  const handleStepComplete = (index: number) => {
    setSession((prev) => {
      const newSteps = [...prev.steps];
      newSteps[index] = { ...newSteps[index], completed: true };
      return { ...prev, steps: newSteps };
    });
    
    if (index < session.steps.length - 1) {
      setCurrentStepIndex(index + 1);
      setStepRemaining(session.steps[index + 1].durationSeconds);
      setIsStepRunning(false);
    } else {
      // All steps completed
      setIsSessionRunning(false);
    }
  };

  const handleFinishSession = () => {
    setIsSessionRunning(false);
    setIsStepRunning(false);
    onCompleteSession({
      ...session,
      totalDurationSeconds: sessionElapsed,
    });
  };

  const currentStep = session.steps[currentStepIndex];
  const isFinished = currentStepIndex >= session.steps.length - 1 && session.steps[session.steps.length - 1].completed;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Thin Background Header Stopwatch */}
      <header className="bg-slate-900 text-slate-300 px-4 py-2 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSessionRunning(!isSessionRunning)}
            className="p-1.5 hover:bg-slate-800 rounded-md transition-colors"
          >
            {isSessionRunning ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="font-mono text-sm tracking-widest">
            {formatTime(sessionElapsed)}
          </span>
        </div>
        <button
          onClick={onCancel}
          className="p-1.5 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-white"
        >
          <X size={16} />
        </button>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-6 flex flex-col">
        {/* Central Countdown */}
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          {!isFinished ? (
            <>
              <div className="text-slate-500 font-medium mb-4 uppercase tracking-widest text-sm">
                Step {currentStepIndex + 1} of {session.steps.length}
              </div>
              <div className="text-8xl font-mono font-light text-slate-800 tracking-tighter mb-12 tabular-nums">
                {formatTime(stepRemaining)}
              </div>
              
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setIsStepRunning(!isStepRunning)}
                  className="w-20 h-20 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-200 transition-all active:scale-95"
                >
                  {isStepRunning ? <Pause size={32} /> : <Play size={32} className="ml-1" />}
                </button>
                
                <button
                  onClick={() => {
                    setIsStepRunning(false);
                    handleStepComplete(currentStepIndex);
                  }}
                  className="w-16 h-16 flex items-center justify-center bg-white border-2 border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-400 rounded-full shadow-sm transition-all active:scale-95"
                  title="Mark step complete"
                >
                  <CheckCircle2 size={28} />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={48} />
              </div>
              <h2 className="text-3xl font-bold text-slate-800">All Steps Complete!</h2>
              <p className="text-slate-500">Great job on today's session.</p>
            </div>
          )}
        </div>

        {/* Steps List */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6">
          <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-4">
            Session Plan
          </h3>
          <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
            {session.steps.map((step, idx) => (
              <div
                key={step.id}
                className={`flex items-center justify-between p-3 rounded-2xl transition-colors ${
                  idx === currentStepIndex && !isFinished
                    ? 'bg-indigo-50 border border-indigo-100'
                    : step.completed
                    ? 'bg-slate-50 opacity-60'
                    : 'bg-white border border-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  {step.completed ? (
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  ) : idx === currentStepIndex && !isFinished ? (
                    <Play size={20} className="text-indigo-500" />
                  ) : (
                    <Circle size={20} className="text-slate-300" />
                  )}
                  <span className={`font-medium ${step.completed ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
                    Step {idx + 1}
                  </span>
                </div>
                <span className="text-slate-500 font-mono text-sm">
                  {formatDuration(step.durationSeconds)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Finish Button */}
        <button
          onClick={handleFinishSession}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white p-4 rounded-2xl shadow-sm transition-colors text-lg font-semibold"
        >
          <Flag size={20} />
          Finish Session
        </button>
      </main>
    </div>
  );
}
