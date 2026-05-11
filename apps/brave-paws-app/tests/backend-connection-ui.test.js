import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('dashboard storage sync includes backend connection settings with test, save, and reset affordances', () => {
  const storageSync = readFileSync(resolve(process.cwd(), 'src/components/StorageSync.tsx'), 'utf8');
  const backendConnection = readFileSync(resolve(process.cwd(), 'src/components/BackendConnectionSettings.tsx'), 'utf8');

  assert.match(storageSync, /backendConnection/);
  assert.match(backendConnection, /Backend connection/);
  assert.match(backendConnection, /Backend server URL/);
  assert.match(backendConnection, /Test &amp; Save/);
  assert.match(backendConnection, /Reset to deployment default/);
});

test('backend connection settings guide the static frontend failure path', () => {
  const backendConnection = readFileSync(resolve(process.cwd(), 'src/components/BackendConnectionSettings.tsx'), 'utf8');

  assert.match(backendConnection, /Connect to your Brave Paws backend/);
  assert.match(backendConnection, /static <span className="font-semibold text-slate-700">harvey\.cash<\/span> app/i);
  assert.match(backendConnection, /QUANTUM Tailnet root URL/i);
  assert.match(backendConnection, /Suggested camera link/);
});
