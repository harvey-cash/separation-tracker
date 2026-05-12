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
  assert.match(app, /\}, \[activeSession, currentView, cameraStreamingControl\.capability\.canSetEnabled, cameraStreamingControl\.setEnabled\]\);/);
});


test('camera streaming control rechecks backend capabilities on resume-style browser events', () => {
  const hook = readFileSync(resolve(process.cwd(), 'src/hooks/useCameraStreamingControl.ts'), 'utf8');

  assert.match(hook, /setIsLoading\(true\);/);
  assert.match(hook, /refreshInFlightRef/);
  assert.match(hook, /window\.addEventListener\('focus', handleResume\);/);
  assert.match(hook, /window\.addEventListener\('online', handleResume\);/);
  assert.match(hook, /window\.addEventListener\('pageshow', handleResume\);/);
  assert.match(hook, /document\.addEventListener\('visibilitychange', handleResume\);/);
  assert.match(hook, /window\.removeEventListener\('pageshow', handleResume\);/);
});
