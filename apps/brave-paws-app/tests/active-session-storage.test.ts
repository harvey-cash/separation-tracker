import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_SESSION_STORAGE_KEY,
  clearActiveSessionState,
  createActiveSessionState,
  loadActiveSessionState,
  saveActiveSessionState,
} from '../src/utils/activeSessionStorage.ts';
import { Session } from '../src/types.ts';
import { shouldAppendInitialTimelineEvent } from '../src/components/ActiveSession.tsx';

function createStorage() {
  const entries = new Map<string, string>();

  return {
    getItem(key: string) {
      return entries.has(key) ? entries.get(key)! : null;
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
    removeItem(key: string) {
      entries.delete(key);
    },
  };
}

function createSession(): Session {
  return {
    id: 'session-1',
    date: '2026-03-14T00:00:00.000Z',
    totalDurationSeconds: 0,
    status: 'pending',
    steps: [
      { id: 'step-1', durationSeconds: 30, status: 'pending' },
      { id: 'step-2', durationSeconds: 10, status: 'pending' },
    ],
  };
}

test('active session state roundtrips through storage', () => {
  const storage = createStorage();
  const state = createActiveSessionState(createSession(), 1_000);

  const timelineEvent = {
    sequence: 0,
    type: 'session_started' as const,
    occurredAt: '2026-05-10T09:00:00.000Z',
    sessionElapsedSeconds: 0,
    sessionRunning: true,
    currentStepIndex: 0,
    stepId: state.session.steps[0]!.id,
    stepStatus: 'pending' as const,
    stepRunning: false,
    stepElapsedSeconds: 0,
    stepDurationSeconds: 30,
  };

  saveActiveSessionState(
    {
      ...state,
      currentStepIndex: 1,
      isStepRunning: true,
      stepClock: { startedAt: 5_000, accumulatedMs: 2_000 },
      timelineEvents: [timelineEvent],
    },
    storage
  );

  assert.deepEqual(loadActiveSessionState(storage), {
    ...state,
    currentStepIndex: 1,
    isStepRunning: true,
    stepClock: { startedAt: 5_000, accumulatedMs: 2_000 },
    timelineEvents: [timelineEvent],
  });
});

test('loadActiveSessionState ignores malformed data', () => {
  const storage = createStorage();

  storage.setItem(ACTIVE_SESSION_STORAGE_KEY, '{"session":true}');

  assert.equal(loadActiveSessionState(storage), null);
});

test('loadActiveSessionState normalizes legacy completion booleans', () => {
  const storage = createStorage();

  storage.setItem(
    ACTIVE_SESSION_STORAGE_KEY,
    JSON.stringify({
      session: {
        id: 'legacy-session',
        date: '2026-03-14T00:00:00.000Z',
        totalDurationSeconds: 12,
        completed: false,
        steps: [
          { id: 'step-1', durationSeconds: 30, completed: true },
          { id: 'step-2', durationSeconds: 10, completed: false },
        ],
      },
      currentStepIndex: 1,
      isSessionRunning: false,
      sessionClock: { startedAt: null, accumulatedMs: 12_000 },
      isStepRunning: false,
      stepClock: { startedAt: null, accumulatedMs: 0 },
    })
  );

  const restored = loadActiveSessionState(storage);

  assert.ok(restored);
  assert.equal(restored?.session.status, 'pending');
  assert.deepEqual(restored?.session.steps.map((step) => step.status), ['completed', 'pending']);
  assert.deepEqual(restored?.timelineEvents, []);
});

test('clearActiveSessionState removes persisted state', () => {
  const storage = createStorage();

  saveActiveSessionState(createActiveSessionState(createSession(), 1_000), storage);
  clearActiveSessionState(storage);

  assert.equal(storage.getItem(ACTIVE_SESSION_STORAGE_KEY), null);
});

test('shouldAppendInitialTimelineEvent adds a restore resume marker when prior events exist', () => {
  const restoredState = createActiveSessionState(createSession(), 1_000);

  assert.equal(shouldAppendInitialTimelineEvent(undefined, []), true);
  assert.equal(shouldAppendInitialTimelineEvent(undefined, [{
    sequence: 0,
    type: 'session_started',
    occurredAt: '2026-05-10T09:00:00.000Z',
    sessionElapsedSeconds: 0,
    sessionRunning: true,
    currentStepIndex: 0,
    stepId: 'step-1',
    stepStatus: 'pending',
    stepRunning: false,
    stepElapsedSeconds: 0,
    stepDurationSeconds: 30,
  }]), false);
  assert.equal(shouldAppendInitialTimelineEvent(restoredState, [{
    sequence: 0,
    type: 'session_started',
    occurredAt: '2026-05-10T09:00:00.000Z',
    sessionElapsedSeconds: 0,
    sessionRunning: true,
    currentStepIndex: 0,
    stepId: 'step-1',
    stepStatus: 'pending',
    stepRunning: false,
    stepElapsedSeconds: 0,
    stepDurationSeconds: 30,
  }]), true);
  assert.equal(shouldAppendInitialTimelineEvent(restoredState, [{
    sequence: 1,
    type: 'session_resumed',
    occurredAt: '2026-05-10T09:10:00.000Z',
    sessionElapsedSeconds: 10,
    sessionRunning: true,
    currentStepIndex: 0,
    stepId: 'step-1',
    stepStatus: 'pending',
    stepRunning: false,
    stepElapsedSeconds: 0,
    stepDurationSeconds: 30,
  }]), false);
});
