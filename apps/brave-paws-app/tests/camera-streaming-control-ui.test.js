import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('App wires camera streaming control into the dashboard and active session lifecycle', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  assert.match(app, /useCameraStreamingControl/);
  assert.match(app, /CameraStreamingControl/);
  assert.match(app, /currentView === 'active' && Boolean\(activeSession\)/);
  assert.match(app, /pendingSessionCameraStateRef\.current = true/);
  assert.match(app, /pendingSessionCameraStateRef\.current = false/);
  assert.match(app, /setEnabled\(pendingState, \{ silent: true \}\)/);
});
