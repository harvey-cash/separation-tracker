import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('settings view hosts the backend connection controls instead of the dashboard storage card', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const settingsView = readFileSync(resolve(process.cwd(), 'src/components/SettingsView.tsx'), 'utf8');
  const storageSync = readFileSync(resolve(process.cwd(), 'src/components/StorageSync.tsx'), 'utf8');

  assert.match(app, /currentView === 'settings'/);
  assert.match(settingsView, /<BackendConnectionSettings/);
  assert.doesNotMatch(storageSync, /backendConnection/);
});

test('settings view exposes backend connection and longest departure auto-increment controls', () => {
  const settingsView = readFileSync(resolve(process.cwd(), 'src/components/SettingsView.tsx'), 'utf8');
  const backendConnection = readFileSync(resolve(process.cwd(), 'src/components/BackendConnectionSettings.tsx'), 'utf8');

  assert.match(settingsView, /Longest departure auto-increment/);
  assert.match(settingsView, /Minutes/);
  assert.match(settingsView, /Percentage/);
  assert.match(settingsView, /Saved automatically on this device/);
  assert.match(backendConnection, /Backend connection/);
  assert.match(backendConnection, /Backend server URL/);
  assert.match(backendConnection, /Test &amp; Save/);
  assert.match(backendConnection, /Reset to deployment default/);
});

test('backend connection settings guide the static frontend failure path', () => {
  const backendConnection = readFileSync(resolve(process.cwd(), 'src/components/BackendConnectionSettings.tsx'), 'utf8');

  assert.match(backendConnection, /Connect to your Brave Paws backend/);
  assert.match(backendConnection, /separately hosted frontend/i);
  assert.match(backendConnection, /Enter your backend root URL/i);
  assert.match(backendConnection, /Suggested camera link/);
});
