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

  saveActiveSessionState(
    {
      ...state,
      currentStepIndex: 1,
      isStepRunning: true,
      stepClock: { startedAt: 5_000, accumulatedMs: 2_000 },
    },
    storage
  );

  assert.deepEqual(loadActiveSessionState(storage), {
    ...state,
    currentStepIndex: 1,
    isStepRunning: true,
    stepClock: { startedAt: 5_000, accumulatedMs: 2_000 },
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
});

test('clearActiveSessionState removes persisted state', () => {
  const storage = createStorage();

  saveActiveSessionState(createActiveSessionState(createSession(), 1_000), storage);
  clearActiveSessionState(storage);

  assert.equal(storage.getItem(ACTIVE_SESSION_STORAGE_KEY), null);
});
