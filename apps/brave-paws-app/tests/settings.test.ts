import test from 'node:test';
import assert from 'node:assert/strict';

import {
  APP_SETTINGS_STORAGE_KEY,
  buildNewSessionSteps,
  loadAppSettings,
  normalizeAppSettings,
  saveAppSettings,
} from '../src/settings.ts';
import type { Step } from '../src/types.ts';

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createStorage(initialEntries: Record<string, string> = {}): StorageLike {
  const store = new Map(Object.entries(initialEntries));

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

const PREVIOUS_STEPS: Step[] = [
  { id: 'step-1', durationSeconds: 30, status: 'completed' },
  { id: 'step-2', durationSeconds: 480, status: 'completed' },
  { id: 'step-3', durationSeconds: 45, status: 'completed' },
];

test('normalizeAppSettings falls back to defaults for malformed values', () => {
  assert.deepEqual(normalizeAppSettings(null), {
    longestDepartureIncrement: {
      mode: 'minutes',
      value: 0,
    },
  });

  assert.deepEqual(normalizeAppSettings({
    longestDepartureIncrement: {
      mode: 'nonsense',
      value: -4,
    },
  }), {
    longestDepartureIncrement: {
      mode: 'minutes',
      value: 0,
    },
  });
});

test('loadAppSettings returns defaults when storage is empty', () => {
  const storage = createStorage();

  assert.deepEqual(loadAppSettings(storage), {
    longestDepartureIncrement: {
      mode: 'minutes',
      value: 0,
    },
  });
});

test('saveAppSettings persists normalized settings', () => {
  const storage = createStorage();

  const saved = saveAppSettings({
    longestDepartureIncrement: {
      mode: 'percentage',
      value: 12,
    },
  }, storage);

  assert.deepEqual(saved, {
    longestDepartureIncrement: {
      mode: 'percentage',
      value: 12,
    },
  });
  assert.equal(storage.getItem(APP_SETTINGS_STORAGE_KEY), JSON.stringify(saved));
});

test('buildNewSessionSteps adds the configured minutes to the first longest prior step', () => {
  const steps = buildNewSessionSteps(PREVIOUS_STEPS, {
    longestDepartureIncrement: {
      mode: 'minutes',
      value: 2,
    },
  });

  assert.deepEqual(steps.map((step) => step.durationSeconds), [30, 600, 45]);
  assert.deepEqual(steps.map((step) => step.status), ['pending', 'pending', 'pending']);
  assert.deepEqual(steps.map((step) => step.actualDurationSeconds ?? null), [null, null, null]);
  assert.notEqual(steps[0]?.id, PREVIOUS_STEPS[0]?.id);
  assert.notEqual(steps[1]?.id, PREVIOUS_STEPS[1]?.id);
});

test('buildNewSessionSteps applies percentage increments and rounds to the nearest five seconds', () => {
  const steps = buildNewSessionSteps(PREVIOUS_STEPS, {
    longestDepartureIncrement: {
      mode: 'percentage',
      value: 10,
    },
  });

  assert.deepEqual(steps.map((step) => step.durationSeconds), [30, 530, 45]);
});

test('buildNewSessionSteps leaves durations unchanged when auto-increment is disabled', () => {
  const steps = buildNewSessionSteps(PREVIOUS_STEPS, {
    longestDepartureIncrement: {
      mode: 'minutes',
      value: 0,
    },
  });

  assert.deepEqual(steps.map((step) => step.durationSeconds), [30, 480, 45]);
});
