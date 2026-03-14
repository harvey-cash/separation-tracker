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
    completed: false,
    steps: [
      { id: 'step-1', durationSeconds: 30, completed: false },
      { id: 'step-2', durationSeconds: 10, completed: false },
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

test('clearActiveSessionState removes persisted state', () => {
  const storage = createStorage();

  saveActiveSessionState(createActiveSessionState(createSession(), 1_000), storage);
  clearActiveSessionState(storage);

  assert.equal(storage.getItem(ACTIVE_SESSION_STORAGE_KEY), null);
});
