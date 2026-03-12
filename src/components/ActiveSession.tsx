import { useState, useEffect, useCallback } from 'react';
import { Session } from '../types';
import { Play, Pause, CheckCircle2, Circle, Flag, X, Heart } from 'lucide-react';
import { formatTime, formatDuration } from '../utils/format';
import { TimerClock, getElapsedSeconds, getRemainingSeconds, pauseTimer, startTimer } from '../utils/timer';

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
  const [sessionClock, setSessionClock] = useState<TimerClock>(() => ({
    startedAt: Date.now(),
    accumulatedMs: 0,
  }));

  // Current step countdown
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isStepRunning, setIsStepRunning] = useState(false);
  const [stepRemaining, setStepRemaining] = useState(
    session.steps[0]?.durationSeconds || 0
  );
  const [stepClock, setStepClock] = useState<TimerClock>({
    startedAt: null,
    accumulatedMs: 0,
  });

  const syncSessionElapsed = useCallback((now = Date.now()) => {
    setSessionElapsed(getElapsedSeconds(sessionClock, now));
  }, [sessionClock]);

  const completeStep = useCallback((index: number, now = Date.now()) => {
    setStepClock({ startedAt: null, accumulatedMs: 0 });
    setStepRemaining(0);

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
      const pausedSessionClock = pauseTimer(sessionClock, now);
      setSessionClock(pausedSessionClock);
      setSessionElapsed(getElapsedSeconds(pausedSessionClock, now));
      setIsStepRunning(false);
      setIsSessionRunning(false);
    }
  }, [session.steps, sessionClock]);

  const syncStepRemaining = useCallback((now = Date.now()) => {
    const currentStep = session.steps[currentStepIndex];
    if (!currentStep) {
      return;
    }

    const remaining = getRemainingSeconds(currentStep.durationSeconds, stepClock, now);
    setStepRemaining(remaining);

    if (isStepRunning && remaining === 0) {
      completeStep(currentStepIndex, now);
    }
  }, [completeStep, currentStepIndex, isStepRunning, session.steps, stepClock]);

  // Background Stopwatch
  useEffect(() => {
    syncSessionElapsed();
    if (!isSessionRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      syncSessionElapsed();
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isSessionRunning, syncSessionElapsed]);

  // Step Countdown
  useEffect(() => {
    syncStepRemaining();
    if (!isStepRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      syncStepRemaining();
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isStepRunning, syncStepRemaining]);

  useEffect(() => {
    const syncTimers = () => {
      const now = Date.now();
      syncSessionElapsed(now);
      syncStepRemaining(now);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncTimers();
      }
    };

    window.addEventListener('focus', syncTimers);
    window.addEventListener('pageshow', syncTimers);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', syncTimers);
      window.removeEventListener('pageshow', syncTimers);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncSessionElapsed, syncStepRemaining]);

  const handleToggleSession = () => {
    const now = Date.now();
    if (isSessionRunning) {
      const pausedClock = pauseTimer(sessionClock, now);
      setSessionClock(pausedClock);
      setSessionElapsed(getElapsedSeconds(pausedClock, now));
      setIsSessionRunning(false);
      return;
    }

    setSessionClock((prev) => startTimer(prev, now));
    setIsSessionRunning(true);
  };

  const handleToggleStep = () => {
    const now = Date.now();
    if (isStepRunning) {
      const pausedClock = pauseTimer(stepClock, now);
      setStepClock(pausedClock);
      setStepRemaining(
        getRemainingSeconds(session.steps[currentStepIndex]?.durationSeconds || 0, pausedClock, now)
      );
      setIsStepRunning(false);
      return;
    }

    setStepClock((prev) => startTimer(prev, now));
    setIsStepRunning(true);
  };

  const handleFinishSession = () => {
    const now = Date.now();
    const finalSessionClock = isSessionRunning ? pauseTimer(sessionClock, now) : sessionClock;
    setSessionClock(finalSessionClock);
    setSessionElapsed(getElapsedSeconds(finalSessionClock, now));
    setIsSessionRunning(false);
    setIsStepRunning(false);
    onCompleteSession({
      ...session,
      totalDurationSeconds: getElapsedSeconds(finalSessionClock, now),
    });
  };

  const currentStep = session.steps[currentStepIndex];
  const isFinished = currentStepIndex >= session.steps.length - 1 && session.steps[session.steps.length - 1].completed;

  return (
    <div className="min-h-screen bg-[#fdfbf7] flex flex-col">
      {/* Thin Background Header Stopwatch */}
      <header className="bg-rose-900 text-rose-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleSession}
            className="p-1.5 hover:bg-rose-800 rounded-md transition-colors"
          >
            {isSessionRunning ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span className="font-mono text-sm tracking-widest font-medium">
            {formatTime(sessionElapsed)}
          </span>
          <span className="text-xs text-rose-300 ml-2 hidden sm:inline">Total elapsed time</span>
        </div>
        <button
          onClick={onCancel}
          className="p-1.5 hover:bg-rose-800 rounded-md transition-colors text-rose-300 hover:text-white"
        >
          <X size={18} />
        </button>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto p-6 flex flex-col">
        {/* Central Countdown */}
        <div className="flex-1 flex flex-col items-center justify-center py-12">
          {!isFinished ? (
            <>
              <div className="text-rose-400 font-bold mb-4 uppercase tracking-widest text-sm flex items-center gap-2">
                <Heart size={14} fill="currentColor" />
                Step {currentStepIndex + 1} of {session.steps.length}
              </div>
              <div className="text-8xl font-mono font-light text-slate-800 tracking-tighter mb-12 tabular-nums">
                {formatTime(stepRemaining)}
              </div>
              
              <div className="flex items-center gap-6">
                <button
                  onClick={handleToggleStep}
                  className="w-24 h-24 flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white rounded-full shadow-lg shadow-rose-200 transition-all active:scale-95"
                >
                  {isStepRunning ? <Pause size={36} /> : <Play size={36} className="ml-2" fill="currentColor" />}
                </button>
                
                <button
                  onClick={() => {
                    setIsStepRunning(false);
                    completeStep(currentStepIndex);
                  }}
                  className="w-16 h-16 flex items-center justify-center bg-white border-2 border-slate-200 hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50 text-slate-400 rounded-full shadow-sm transition-all active:scale-95"
                  title="Mark step complete"
                >
                  <CheckCircle2 size={28} />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Heart size={48} fill="currentColor" />
              </div>
              <h2 className="text-4xl font-serif font-bold text-slate-800">All Done!</h2>
              <p className="text-slate-500 italic">Every small step is a big victory.</p>
            </div>
          )}
        </div>

        {/* Steps List */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 mb-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Flag size={16} className="text-rose-400" />
            Today's Journey
          </h3>
          <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
            {session.steps.map((step, idx) => (
              <div
                key={step.id}
                className={`flex items-center justify-between p-3 rounded-2xl transition-colors ${
                  idx === currentStepIndex && !isFinished
                    ? 'bg-rose-50 border border-rose-100'
                    : step.completed
                    ? 'bg-slate-50 opacity-60'
                    : 'bg-white border border-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  {step.completed ? (
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  ) : idx === currentStepIndex && !isFinished ? (
                    <Play size={20} className="text-rose-500" fill="currentColor" />
                  ) : (
                    <Circle size={20} className="text-slate-300" />
                  )}
                  <span className={`font-medium ${step.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    Step {idx + 1}
                  </span>
                </div>
                <span className="text-slate-500 font-mono text-sm font-medium">
                  {formatDuration(step.durationSeconds)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Finish Button */}
        <button
          onClick={handleFinishSession}
          className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white p-5 rounded-3xl shadow-sm transition-colors text-lg font-bold"
        >
          <CheckCircle2 size={24} />
          Wrap Up Session
        </button>
      </main>
    </div>
  );
}
