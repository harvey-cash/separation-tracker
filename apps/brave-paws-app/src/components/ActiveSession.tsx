import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, StepStatus } from '../types';
import { Play, Pause, CheckCircle2, Circle, Flag, X, Heart, VideoOff, RotateCcw, Minimize2, Maximize2 } from 'lucide-react';
import { formatTime, formatDuration } from '../utils/format';
import { buildCameraStreamUrl, isCameraUrlValid } from '../utils/cameraUrl';
import { CameraLinkInput } from './CameraLinkInput';
import { TimerClock, getElapsedSeconds, getRemainingSeconds, pauseTimer, startTimer } from '../utils/timer';
import { ActiveSessionState } from '../utils/activeSessionStorage';
import { reportClientDiagnostic } from '../utils/clientDiagnostics';

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
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'live' | 'degraded' | 'disconnected'>('idle');
  const [previewStatusMessage, setPreviewStatusMessage] = useState('Paste a stream URL or use the QUANTUM picam shortcut to start the live preview.');
  const [isPreviewConnected, setIsPreviewConnected] = useState(() => isCameraUrlValid(cameraUrl));
  const [isPreviewMinimized, setIsPreviewMinimized] = useState(false);
  const lastLoggedPreviewStatusRef = useRef<string | null>(null);
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

  const finalizeStep = useCallback((index: number, status: StepStatus, now = Date.now()) => {
    updateStepClock({ startedAt: null, accumulatedMs: 0 });
    setStepRemaining(0);
    isStepRunningRef.current = false;
    setIsStepRunning(false);

    setSession((prev) => {
      const newSteps = [...prev.steps];
      newSteps[index] = { ...newSteps[index], status };
      const updatedSession = { ...prev, steps: newSteps };
      sessionRef.current = updatedSession;
      return updatedSession;
    });
    
    if (index < sessionRef.current.steps.length - 1) {
      const nextStepIndex = index + 1;
      currentStepIndexRef.current = nextStepIndex;
      setCurrentStepIndex(nextStepIndex);
      setStepRemaining(sessionRef.current.steps[nextStepIndex].durationSeconds);
    } else {
      const pausedSessionClock = pauseTimer(sessionClockRef.current, now);
      updateSessionClock(pausedSessionClock);
      setSessionElapsed(getElapsedSeconds(pausedSessionClock, now));
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
        finalizeStep(currentStepIndexRef.current, 'completed', now);
      }
  }, [finalizeStep]);

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
  const isFinished = session.steps.every((step) => step.status !== 'pending');
  const abortedSteps = session.steps.filter((step) => step.status === 'aborted').length;
  const streamUrl = buildCameraStreamUrl(cameraUrl);
  const hasValidCameraUrl = streamUrl.length > 0;
  const activePreviewUrl = hasValidCameraUrl && isPreviewConnected ? streamUrl : '';

  useEffect(() => {
    if (!hasValidCameraUrl) {
      setIsPreviewConnected(false);
      setIsPreviewMinimized(false);
    }
  }, [hasValidCameraUrl]);

  useEffect(() => {
    if (!hasValidCameraUrl) {
      setPreviewStatus('idle');
      setPreviewStatusMessage('Paste a stream URL or use the QUANTUM picam shortcut to start the live preview.');
      return;
    }

    if (!isPreviewConnected) {
      setPreviewStatus('disconnected');
      setPreviewStatusMessage('Camera preview disconnected. Paste a new stream URL or reconnect.');
      return;
    }

    setPreviewStatus('loading');
    setPreviewStatusMessage('Connecting to remote preview…');
  }, [hasValidCameraUrl, isPreviewConnected, streamUrl]);

  useEffect(() => {
    if (!activePreviewUrl) {
      return;
    }

    setPreviewStatus('loading');
    setPreviewStatusMessage('Connecting to remote preview…');

    const timeoutId = window.setTimeout(() => {
      setPreviewStatus('degraded');
      setPreviewStatusMessage('Remote preview looks delayed. Refresh it or disconnect and reconnect.');
    }, PREVIEW_LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePreviewUrl, previewReloadToken]);

  useEffect(() => {
    if (!activePreviewUrl || previewStatus !== 'degraded') {
      if (previewStatus === 'live' || previewStatus === 'loading' || previewStatus === 'idle') {
        lastLoggedPreviewStatusRef.current = null;
      }
      return;
    }

    const fingerprint = `camera-preview:${previewStatus}:${activePreviewUrl}`;
    if (lastLoggedPreviewStatusRef.current === fingerprint) {
      return;
    }

    lastLoggedPreviewStatusRef.current = fingerprint;
    reportClientDiagnostic({
      category: 'camera_preview_issue',
      severity: 'warn',
      message: previewStatusMessage,
      fingerprint,
      details: {
        previewStatus,
        previewUrl: activePreviewUrl,
      },
    });
  }, [activePreviewUrl, previewStatus, previewStatusMessage]);

  const handlePreviewLoad = useCallback(() => {
    lastLoggedPreviewStatusRef.current = null;
    setPreviewStatus('live');
    setPreviewStatusMessage('Remote preview connected.');
  }, []);

  const handlePreviewRetry = useCallback(() => {
    if (!activePreviewUrl) {
      return;
    }

    setPreviewStatus('loading');
    setPreviewStatusMessage('Refreshing remote preview…');
    setPreviewReloadToken((current) => current + 1);
  }, [activePreviewUrl]);

  const handleTogglePreviewConnection = useCallback(() => {
    if (!hasValidCameraUrl) {
      return;
    }

    if (isPreviewConnected) {
      setIsPreviewConnected(false);
      setIsPreviewMinimized(false);
      return;
    }

    setIsPreviewConnected(true);
    setPreviewReloadToken((current) => current + 1);
  }, [hasValidCameraUrl, isPreviewConnected]);

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
        <section className="space-y-2">
          {!isPreviewMinimized && hasValidCameraUrl && isPreviewConnected ? (
            <div className="w-full aspect-video bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800">
              <iframe
                key={`${activePreviewUrl}-${previewReloadToken}`}
                src={activePreviewUrl}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; microphone"
                onLoad={handlePreviewLoad}
              />
            </div>
          ) : !isPreviewMinimized ? (
            <div className="w-full bg-slate-100 rounded-xl border border-slate-200 border-dashed p-4 flex flex-col items-center justify-center text-slate-500 gap-3">
              <div className="flex items-center gap-2 text-slate-400">
                <VideoOff size={20} />
                <span className="text-sm font-medium">Add Stream URL</span>
              </div>
              <div className="w-full">
                <CameraLinkInput
                  cameraUrl={cameraUrl}
                  onCameraUrlChange={(url) => onCameraUrlChange?.(url)}
                  onDone={() => {
                    setIsPreviewConnected(true);
                    setIsPreviewMinimized(false);
                    setPreviewReloadToken((current) => current + 1);
                  }}
                  compact
                  initialMode="manual"
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <span>{previewStatusMessage}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePreviewRetry}
                disabled={!activePreviewUrl}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={12} />
                Refresh
              </button>
              {hasValidCameraUrl && (
                <button
                  type="button"
                  onClick={handleTogglePreviewConnection}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                >
                  {isPreviewConnected ? 'Disconnect' : 'Reconnect'}
                </button>
              )}
              {hasValidCameraUrl && isPreviewConnected && (
                <button
                  type="button"
                  onClick={() => setIsPreviewMinimized((current) => !current)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                >
                  {isPreviewMinimized ? (
                    <>
                      <Maximize2 size={12} />
                      Maximise
                    </>
                  ) : (
                    <>
                      <Minimize2 size={12} />
                      Minimise
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </section>

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
                  aria-label={isStepRunning ? 'Pause Step' : 'Start Step'}
                >
                  {isStepRunning ? <Pause size={36} /> : <Play size={36} className="ml-2" fill="currentColor" />}
                </button>

                <button
                  onClick={() => finalizeStep(currentStepIndex, 'aborted')}
                  className="w-16 h-16 flex items-center justify-center bg-white border-2 border-slate-200 hover:border-amber-400 hover:text-amber-500 hover:bg-amber-50 text-slate-400 rounded-full shadow-sm transition-all active:scale-95"
                  title="Abort step"
                  aria-label="Abort Step"
                >
                  <X size={28} />
                </button>
                
                <button
                  onClick={() => {
                    finalizeStep(currentStepIndex, 'completed');
                  }}
                  className="w-16 h-16 flex items-center justify-center bg-white border-2 border-slate-200 hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50 text-slate-400 rounded-full shadow-sm transition-all active:scale-95"
                  title="Mark step complete"
                  aria-label="Complete Step"
                >
                  <CheckCircle2 size={28} />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center space-y-6">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${abortedSteps > 0 ? 'bg-amber-100 text-amber-500' : 'bg-emerald-100 text-emerald-500'}`}>
                <Heart size={48} fill="currentColor" />
              </div>
              <h2 className="text-4xl font-serif font-bold text-slate-800">
                {abortedSteps > 0 ? 'Step Log Complete' : 'All Done!'}
              </h2>
              <p className="text-slate-500 italic">
                {abortedSteps > 0 ? 'You can mark the overall session as completed or aborted on the wrap-up screen.' : 'Every small step is a big victory.'}
              </p>
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
                    : step.status === 'completed'
                    ? 'bg-slate-50 opacity-60'
                    : step.status === 'aborted'
                    ? 'bg-amber-50 border border-amber-100'
                    : 'bg-white border border-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  {step.status === 'completed' ? (
                    <CheckCircle2 size={20} className="text-emerald-400" />
                  ) : step.status === 'aborted' ? (
                    <X size={20} className="text-amber-500" />
                  ) : idx === currentStepIndex && !isFinished ? (
                    <Play size={20} className="text-rose-500" fill="currentColor" />
                  ) : (
                    <Circle size={20} className="text-slate-300" />
                  )}
                  <span className={`font-medium ${
                    step.status === 'completed'
                      ? 'text-slate-400 line-through'
                      : step.status === 'aborted'
                      ? 'text-amber-700 line-through'
                      : 'text-slate-700'
                  }`}>
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
