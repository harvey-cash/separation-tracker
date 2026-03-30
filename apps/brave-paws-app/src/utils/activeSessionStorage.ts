import { Session } from '../types';
import { TimerClock } from './timer';
import { normalizeSession } from './sessionStatus';

export const ACTIVE_SESSION_STORAGE_KEY = 'csa_tracker_active_session';

export type ActiveSessionState = {
  session: Session;
  currentStepIndex: number;
  isSessionRunning: boolean;
  sessionClock: TimerClock;
  isStepRunning: boolean;
  stepClock: TimerClock;
};

function isTimerClock(value: unknown): value is TimerClock {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TimerClock>;
  return (candidate.startedAt === null || typeof candidate.startedAt === 'number') && typeof candidate.accumulatedMs === 'number';
}

function normalizeActiveSessionState(value: unknown): ActiveSessionState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ActiveSessionState>;
  const session = normalizeSession(candidate.session);

  if (
    !session ||
    typeof candidate.currentStepIndex !== 'number' ||
    typeof candidate.isSessionRunning !== 'boolean' ||
    typeof candidate.isStepRunning !== 'boolean' ||
    !isTimerClock(candidate.sessionClock) ||
    !isTimerClock(candidate.stepClock)
  ) {
    return null;
  }

  return {
    session,
    currentStepIndex: candidate.currentStepIndex,
    isSessionRunning: candidate.isSessionRunning,
    sessionClock: candidate.sessionClock,
    isStepRunning: candidate.isStepRunning,
    stepClock: candidate.stepClock,
  };
}

export function createActiveSessionState(session: Session, now = Date.now()): ActiveSessionState {
  const normalizedSession = normalizeSession(session) ?? session;

  return {
    session: normalizedSession,
    currentStepIndex: 0,
    isSessionRunning: true,
    sessionClock: {
      startedAt: now,
      accumulatedMs: 0,
    },
    isStepRunning: false,
    stepClock: {
      startedAt: null,
      accumulatedMs: 0,
    },
  };
}

export function loadActiveSessionState(storage = window.localStorage): ActiveSessionState | null {
  const stored = storage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return normalizeActiveSessionState(parsed);
  } catch {
    return null;
  }
}

export function saveActiveSessionState(state: ActiveSessionState, storage = window.localStorage) {
  storage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(state));
}

export function clearActiveSessionState(storage = window.localStorage) {
  storage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
}
