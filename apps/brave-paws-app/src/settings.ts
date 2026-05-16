import type { Step } from './types';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LongestStepAutoIncrementMode = 'minutes' | 'percentage';

export type AppSettings = {
  longestDepartureIncrement: {
    mode: LongestStepAutoIncrementMode;
    value: number;
  };
};

export const APP_SETTINGS_STORAGE_KEY = 'brave_paws_settings';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  longestDepartureIncrement: {
    mode: 'minutes',
    value: 0,
  },
};

function getStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage;
}

function safeStorageGet(storage: StorageLike | null, key: string): string | null {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage: StorageLike | null, key: string, value: string): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // Ignore blocked storage writes.
  }
}

function normalizeMode(value: unknown): LongestStepAutoIncrementMode {
  return value === 'percentage' ? 'percentage' : 'minutes';
}

function normalizeValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_APP_SETTINGS;
  }

  const candidate = value as {
    longestDepartureIncrement?: {
      mode?: unknown;
      value?: unknown;
    };
  };

  return {
    longestDepartureIncrement: {
      mode: normalizeMode(candidate.longestDepartureIncrement?.mode),
      value: normalizeValue(candidate.longestDepartureIncrement?.value),
    },
  };
}

export function loadAppSettings(storage: StorageLike | null = getStorage()): AppSettings {
  const stored = safeStorageGet(storage, APP_SETTINGS_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_APP_SETTINGS;
  }

  try {
    return normalizeAppSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings, storage: StorageLike | null = getStorage()): AppSettings {
  const normalized = normalizeAppSettings(settings);
  safeStorageSet(storage, APP_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function roundToNearestFiveSeconds(seconds: number): number {
  return Math.max(0, Math.round(seconds / 5) * 5);
}

function getIncrementedLongestStepDurationSeconds(durationSeconds: number, settings: AppSettings): number {
  const { mode, value } = settings.longestDepartureIncrement;
  if (value <= 0) {
    return durationSeconds;
  }

  if (mode === 'percentage') {
    return roundToNearestFiveSeconds(durationSeconds * (1 + value / 100));
  }

  return durationSeconds + Math.round(value * 60);
}

export function buildNewSessionSteps(previousSteps: Step[], settings: AppSettings): Step[] {
  if (previousSteps.length === 0) {
    return [];
  }

  let longestStepIndex = 0;
  for (let index = 1; index < previousSteps.length; index += 1) {
    if (previousSteps[index]!.durationSeconds > previousSteps[longestStepIndex]!.durationSeconds) {
      longestStepIndex = index;
    }
  }

  return previousSteps.map((step, index) => ({
    id: crypto.randomUUID(),
    durationSeconds: index === longestStepIndex
      ? getIncrementedLongestStepDurationSeconds(step.durationSeconds, settings)
      : step.durationSeconds,
    actualDurationSeconds: null,
    status: 'pending',
  }));
}
