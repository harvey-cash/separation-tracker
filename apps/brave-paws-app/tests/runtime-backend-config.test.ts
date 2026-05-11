import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKEND_ROOT_URL_STORAGE_KEY,
  clearStoredBackendRootUrl,
  loadStoredBackendRootUrl,
  resolveApiBaseUrl,
  resolveDefaultCameraUrl,
  saveStoredBackendRootUrl,
} from '../src/config.ts';

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

test('runtime backend override beats build-time API env config', () => {
  const storage = createStorage();
  saveStoredBackendRootUrl('https://quantum.tail080401.ts.net:7447/separation/app/', { storage });

  assert.equal(
    resolveApiBaseUrl({
      origin: 'https://harvey.cash',
      env: {
        VITE_BRAVE_PAWS_API_BASE_URL: 'https://env.example/separation/api/',
      },
      storage,
    }),
    'https://quantum.tail080401.ts.net:7447/separation/api/',
  );
});

test('build-time API env config beats same-origin fallback when no runtime override is saved', () => {
  const storage = createStorage();

  assert.equal(
    resolveApiBaseUrl({
      origin: 'https://harvey.cash',
      env: {
        VITE_BRAVE_PAWS_API_BASE_URL: 'https://env.example/separation/api/',
      },
      storage,
    }),
    'https://env.example/separation/api/',
  );
});

test('malformed runtime backend override is ignored safely', () => {
  const storage = createStorage({
    [BACKEND_ROOT_URL_STORAGE_KEY]: 'definitely not a valid url',
  });

  assert.equal(
    resolveApiBaseUrl({
      origin: 'https://harvey.cash',
      env: {
        VITE_BRAVE_PAWS_API_BASE_URL: 'https://env.example/separation/api/',
      },
      storage,
    }),
    'https://env.example/separation/api/',
  );
});

test('default camera URL follows the saved runtime backend root', () => {
  const storage = createStorage();
  saveStoredBackendRootUrl('https://quantum.tail080401.ts.net:7447', { storage });

  assert.equal(
    resolveDefaultCameraUrl({
      origin: 'https://harvey.cash',
      storage,
    }),
    'https://quantum.tail080401.ts.net:7447/separation/camera/live.stream/',
  );
});

test('reset removes the saved backend root override', () => {
  const storage = createStorage();
  saveStoredBackendRootUrl('https://quantum.tail080401.ts.net:7447', { storage });
  assert.equal(loadStoredBackendRootUrl({ storage }), 'https://quantum.tail080401.ts.net:7447');

  clearStoredBackendRootUrl(storage);

  assert.equal(loadStoredBackendRootUrl({ storage }), null);
});

test('loadStoredBackendRootUrl returns null when storage reads throw', () => {
  const storage: StorageLike = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {},
    removeItem: () => {},
  };

  assert.equal(loadStoredBackendRootUrl({ storage }), null);
});

test('saveStoredBackendRootUrl returns the normalized value when storage writes throw', () => {
  const storage: StorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {},
  };

  assert.equal(saveStoredBackendRootUrl('https://quantum.tail080401.ts.net:7447', { storage }), 'https://quantum.tail080401.ts.net:7447');
});

test('saveStoredBackendRootUrl treats remove failures as a no-op for invalid values', () => {
  const storage: StorageLike = {
    getItem: () => 'https://quantum.tail080401.ts.net:7447',
    setItem: () => {},
    removeItem: () => {
      throw new Error('blocked');
    },
  };

  assert.equal(saveStoredBackendRootUrl('not a url', { storage }), null);
});

test('clearStoredBackendRootUrl ignores storage remove errors', () => {
  const storage: StorageLike = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {
      throw new Error('blocked');
    },
  };

  assert.doesNotThrow(() => clearStoredBackendRootUrl(storage));
});
