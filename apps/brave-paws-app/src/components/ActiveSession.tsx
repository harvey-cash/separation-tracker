import { useState, useEffect, useCallback, useRef } from 'react';
import { Session } from '../types';
import { Play, Pause, CheckCircle2, Circle, Flag, X, Heart, VideoOff, AlertCircle, RotateCcw } from 'lucide-react';
import { formatTime, formatDuration } from '../utils/format';
import { buildCameraStreamUrl, isCameraUrlValid } from '../utils/cameraUrl';
import { CameraLinkInput } from './CameraLinkInput';
import { TimerClock, getElapsedSeconds, getRemainingSeconds, pauseTimer, startTimer } from '../utils/timer';
import { ActiveSessionState } from '../utils/activeSessionStorage';

const PREVIEW_LOAD_TIMEOUT_MS = 12000;

type Props = {
  session: Session;
  initialState?: ActiveSessionState;
  cameraUrl?: string;
  onCameraUrlChange?: (url: string) => void;
  onStateChange?: (state: ActiveSessionState) => void;
  onCompleteSession: (session: Session) => void;
  onCancel: () => void;
};

export function ActiveSession({ session: initialSession, initialState, cameraUrl = '', onCameraUrlChange, onStateChange, onCompleteSession, onCancel }: Props) {
  const restoredState = initialState?.session.id === initialSession.id ? initialState : undefined;
  const initialSessionClock = restoredState?.sessionClock ?? {
    startedAt: Date.now(),
    accumulatedMs: 0,
  };
  const initialStepClock = restoredState?.stepClock ?? {
    startedAt: null,
    accumulatedMs: 0,
  };
  const [session, setSession] = useState<Session>(restoredState?.session ?? initialSession);
  const [isEditingCamera, setIsEditingCamera] = useState(!isCameraUrlValid(cameraUrl));
  
  // Overall session stopwatch
  const [isSessionRunning, setIsSessionRunning] = useState(restoredState?.isSessionRunning ?? true);
  const [sessionElapsed, setSessionElapsed] = useState(() => getElapsedSeconds(initialSessionClock));
  const [sessionClock, setSessionClock] = useState<TimerClock>(() => initialSessionClock);

  // Current step countdown
  const [currentStepIndex, setCurrentStepIndex] = useState(restoredState?.currentStepIndex ?? 0);
  const [isStepRunning, setIsStepRunning] = useState(restoredState?.isStepRunning ?? false);
  const [stepClock, setStepClock] = useState<TimerClock>(() => initialStepClock);
  const [stepRemaining, setStepRemaining] = useState(() => {
    const restoredSession = restoredState?.session ?? initialSession;
    const restoredIndex = restoredState?.currentStepIndex ?? 0;
    const currentStep = restoredSession.steps[restoredIndex];

    if (!currentStep) {
      return 0;
    }

    if (!restoredState) {
      return currentStep.durationSeconds;
    }

    return getRemainingSeconds(currentStep.durationSeconds, restoredState.stepClock);
  });
  const [previewReloadToken, setPreviewReloadToken] = useState(0);
  const [previewStatus, setPreviewStatus] = useState<'loading' | 'live' | 'degraded'>('loading');
  const [previewStatusMessage, setPreviewStatusMessage] = useState('Connecting to remote preview…');
  const sessionRef = useRef(session);
  const sessionClockRef = useRef(sessionClock);
  const currentStepIndexRef = useRef(currentStepIndex);
  const isStepRunningRef = useRef(isStepRunning);
  const stepClockRef = useRef(stepClock);

  sessionRef.current = session;
  sessionClockRef.current = sessionClock;
  currentStepIndexRef.current = currentStepIndex;
  isStepRunningRef.current = isStepRunning;
  stepClockRef.current = stepClock;

  const updateSessionClock = useCallback((clock: TimerClock) => {
    sessionClockRef.current = clock;
    setSessionClock(clock);
  }, []);

  const updateStepClock = useCallback((clock: TimerClock) => {
    stepClockRef.current = clock;
    setStepClock(clock);
  }, []);

  const syncSessionElapsed = useCallback((now = Date.now()) => {
    setSessionElapsed(getElapsedSeconds(sessionClockRef.current, now));
  }, []);

  const completeStep = useCallback((index: number, now = Date.now()) => {
    updateStepClock({ startedAt: null, accumulatedMs: 0 });
    setStepRemaining(0);

    setSession((prev) => {
      const newSteps = [...prev.steps];
      newSteps[index] = { ...newSteps[index], completed: true };
      return { ...prev, steps: newSteps };
    });
    
    if (index < sessionRef.current.steps.length - 1) {
      const nextStepIndex = index + 1;
      currentStepIndexRef.current = nextStepIndex;
      setCurrentStepIndex(nextStepIndex);
      setStepRemaining(sessionRef.current.steps[nextStepIndex].durationSeconds);
      isStepRunningRef.current = false;
      setIsStepRunning(false);
    } else {
      // All steps completed
      const pausedSessionClock = pauseTimer(sessionClockRef.current, now);
      updateSessionClock(pausedSessionClock);
      setSessionElapsed(getElapsedSeconds(pausedSessionClock, now));
      isStepRunningRef.current = false;
      setIsStepRunning(false);
      setIsSessionRunning(false);
    }
  }, [updateSessionClock, updateStepClock]);

  const syncStepRemaining = useCallback((now = Date.now()) => {
    const currentStep = sessionRef.current.steps[currentStepIndexRef.current];
    if (!currentStep) {
      return;
    }

    const remaining = getRemainingSeconds(currentStep.durationSeconds, stepClockRef.current, now);
    setStepRemaining(remaining);

    if (isStepRunningRef.current && remaining === 0) {
      completeStep(currentStepIndexRef.current, now);
    }
  }, [completeStep]);

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

  useEffect(() => {
    onStateChange?.({
      session,
      currentStepIndex,
      isSessionRunning,
      sessionClock,
      isStepRunning,
      stepClock,
    });
  }, [currentStepIndex, isSessionRunning, isStepRunning, onStateChange, session, sessionClock, stepClock]);

  const handleToggleSession = () => {
    const now = Date.now();
    if (isSessionRunning) {
      const pausedClock = pauseTimer(sessionClockRef.current, now);
      updateSessionClock(pausedClock);
      setSessionElapsed(getElapsedSeconds(pausedClock, now));
      setIsSessionRunning(false);
      return;
    }

    updateSessionClock(startTimer(sessionClockRef.current, now));
    setIsSessionRunning(true);
  };

  const handleToggleStep = () => {
    const now = Date.now();
    if (isStepRunning) {
      const pausedClock = pauseTimer(stepClockRef.current, now);
      updateStepClock(pausedClock);
      setStepRemaining(
        getRemainingSeconds(sessionRef.current.steps[currentStepIndexRef.current]?.durationSeconds || 0, pausedClock, now)
      );
      setIsStepRunning(false);
      return;
    }

    updateStepClock(startTimer(stepClockRef.current, now));
    setIsStepRunning(true);
  };

  const handleFinishSession = () => {
    const now = Date.now();
    const finalSessionClock = isSessionRunning ? pauseTimer(sessionClockRef.current, now) : sessionClockRef.current;
    updateSessionClock(finalSessionClock);
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
  const streamUrl = buildCameraStreamUrl(cameraUrl);
  const hasValidCameraUrl = streamUrl.length > 0;
  const activePreviewUrl = streamUrl;

  useEffect(() => {
    setPreviewReloadToken(0);
    if (!hasValidCameraUrl || isEditingCamera) {
      setPreviewStatus('loading');
      setPreviewStatusMessage('Link a remote camera to start the live preview.');
      return;
    }

    setPreviewStatus('loading');
    setPreviewStatusMessage('Connecting to remote preview…');
  }, [hasValidCameraUrl, isEditingCamera, streamUrl]);

  useEffect(() => {
    if (!hasValidCameraUrl || isEditingCamera || !activePreviewUrl) {
      return;
    }

    setPreviewStatus('loading');
    setPreviewStatusMessage('Connecting to remote preview…');

    const timeoutId = window.setTimeout(() => {
      setPreviewStatus('degraded');
      setPreviewStatusMessage('Remote preview is delayed or stalled. Retry the preview or open it in a separate tab.');
    }, PREVIEW_LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePreviewUrl, hasValidCameraUrl, isEditingCamera, previewReloadToken]);

  const handlePreviewLoad = useCallback(() => {
    setPreviewStatus('live');
    setPreviewStatusMessage('Remote preview connected.');
  }, []);

  const handlePreviewRetry = useCallback(() => {
    setPreviewStatus('loading');
    setPreviewStatusMessage('Retrying remote preview…');
    setPreviewReloadToken((current) => current + 1);
  }, []);

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

      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col gap-4">
        {/* Webcam Area */}
        {hasValidCameraUrl && !isEditingCamera ? (
          <div className="w-full aspect-video bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800 relative group">
             <iframe
               key={`${activePreviewUrl}-${previewReloadToken}`}
               src={activePreviewUrl}
               className="w-full h-full border-0 absolute inset-0"
               allow="autoplay; fullscreen; microphone"
               onLoad={handlePreviewLoad}
             />
             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
               <a
                 href={activePreviewUrl}
                 target="_blank"
                 rel="noopener noreferrer"
                 className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-lg text-xs font-medium backdrop-blur-sm border border-slate-700 shadow-sm flex items-center"
               >
                 Popout
               </a>
               <button
                 onClick={() => setIsEditingCamera(true)}
                 className="px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-lg text-xs font-medium backdrop-blur-sm border border-slate-700 shadow-sm"
               >
                 Change Camera
               </button>
             </div>
             <div className="absolute inset-x-0 bottom-0 p-3 pointer-events-none">
               <div
                 className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs shadow-lg backdrop-blur-sm ${
                   previewStatus === 'degraded'
                     ? 'border-amber-200 bg-amber-50/95 text-amber-900'
                     : previewStatus === 'live'
                     ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
                     : 'border-slate-200 bg-white/95 text-slate-700'
                 }`}
               >
                 <div className="flex items-start gap-2">
                   <AlertCircle size={14} className="mt-0.5 shrink-0" />
                   <span>{previewStatusMessage}</span>
                 </div>
                 {previewStatus === 'degraded' && (
                   <button
                     type="button"
                     onClick={handlePreviewRetry}
                     className="inline-flex items-center gap-1 rounded-lg border border-current/20 px-2 py-1 font-medium transition-colors hover:bg-white/60"
                   >
                     <RotateCcw size={12} />
                     Retry
                   </button>
                 )}
               </div>
             </div>
          </div>
        ) : (
          <div className="w-full bg-slate-100 rounded-xl border border-slate-200 border-dashed p-4 flex flex-col items-center justify-center text-slate-500 gap-3">
            <div className="flex items-center gap-2 text-slate-400">
               <VideoOff size={20} />
               <span className="text-sm font-medium">Link Remote Camera</span>
            </div>
            <div className="w-full">
              <CameraLinkInput
                cameraUrl={cameraUrl}
                onCameraUrlChange={(url) => onCameraUrlChange?.(url)}
                onDone={() => setIsEditingCamera(false)}
                onCancel={hasValidCameraUrl ? () => setIsEditingCamera(false) : undefined}
                compact
              />
            </div>
          </div>
        )}

        {/* Central Countdown */}
        <div className="flex-1 flex flex-col items-center justify-center py-6">
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
