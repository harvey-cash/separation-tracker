import { Session, SessionTimelineEvent, SessionTimelineEventType, StepStatus } from '../types';
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
  timelineEvents: SessionTimelineEvent[];
};

function isTimerClock(value: unknown): value is TimerClock {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TimerClock>;
  return (candidate.startedAt === null || typeof candidate.startedAt === 'number') && typeof candidate.accumulatedMs === 'number';
}

const TIMELINE_EVENT_TYPES = new Set<SessionTimelineEventType>([
  'session_started',
  'session_paused',
  'session_resumed',
  'session_finished',
  'session_cancelled',
  'step_started',
  'step_paused',
  'step_resumed',
  'step_completed',
  'step_aborted',
]);

const STEP_STATUSES = new Set<StepStatus>(['pending', 'completed', 'aborted']);

function normalizeTimelineEvent(value: unknown): SessionTimelineEvent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const occurredAt = typeof candidate.occurredAt === 'string' && Number.isFinite(Date.parse(candidate.occurredAt))
    ? new Date(Date.parse(candidate.occurredAt)).toISOString()
    : null;
  const type = TIMELINE_EVENT_TYPES.has(candidate.type as SessionTimelineEventType)
    ? (candidate.type as SessionTimelineEventType)
    : null;
  const sequence = typeof candidate.sequence === 'number' && Number.isFinite(candidate.sequence)
    ? Math.max(0, Math.trunc(candidate.sequence))
    : null;
  const sessionElapsedSeconds = typeof candidate.sessionElapsedSeconds === 'number' && Number.isFinite(candidate.sessionElapsedSeconds)
    ? Math.max(0, candidate.sessionElapsedSeconds)
    : null;

  if (!occurredAt || !type || sequence == null || sessionElapsedSeconds == null) {
    return null;
  }

  return {
    sequence,
    type,
    occurredAt,
    sessionElapsedSeconds,
    sessionRunning: typeof candidate.sessionRunning === 'boolean' ? candidate.sessionRunning : false,
    currentStepIndex: typeof candidate.currentStepIndex === 'number' && Number.isFinite(candidate.currentStepIndex)
      ? Math.max(0, Math.trunc(candidate.currentStepIndex))
      : null,
    stepId: typeof candidate.stepId === 'string' && candidate.stepId.trim() ? candidate.stepId : null,
    stepStatus: STEP_STATUSES.has(candidate.stepStatus as StepStatus) ? (candidate.stepStatus as StepStatus) : null,
    stepRunning: typeof candidate.stepRunning === 'boolean' ? candidate.stepRunning : false,
    stepElapsedSeconds: typeof candidate.stepElapsedSeconds === 'number' && Number.isFinite(candidate.stepElapsedSeconds)
      ? Math.max(0, candidate.stepElapsedSeconds)
      : null,
    stepDurationSeconds: typeof candidate.stepDurationSeconds === 'number' && Number.isFinite(candidate.stepDurationSeconds)
      ? Math.max(0, candidate.stepDurationSeconds)
      : null,
  };
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
    timelineEvents: Array.isArray(candidate.timelineEvents)
      ? candidate.timelineEvents
          .map((event) => normalizeTimelineEvent(event))
          .filter((event): event is SessionTimelineEvent => event !== null)
      : [],
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
    timelineEvents: [],
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
