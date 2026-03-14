import { Session } from '../types';
import { TimerClock } from './timer';

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

function isActiveSessionState(value: unknown): value is ActiveSessionState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ActiveSessionState>;

  return Boolean(
    candidate.session &&
      typeof candidate.session.id === 'string' &&
      Array.isArray(candidate.session.steps) &&
      typeof candidate.currentStepIndex === 'number' &&
      typeof candidate.isSessionRunning === 'boolean' &&
      typeof candidate.isStepRunning === 'boolean' &&
      isTimerClock(candidate.sessionClock) &&
      isTimerClock(candidate.stepClock)
  );
}

export function createActiveSessionState(session: Session, now = Date.now()): ActiveSessionState {
  return {
    session,
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
    return isActiveSessionState(parsed) ? parsed : null;
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
