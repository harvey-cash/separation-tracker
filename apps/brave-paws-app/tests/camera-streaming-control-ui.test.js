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
  assert.match(app, /cameraStreamingControl=\{cameraStreamingControl\}/);
  assert.match(app, /cameraStreamingControl\.isLoading/);
  assert.match(app, /cameraStreamingControl\.capability\.enabled === pendingState/);
  assert.match(app, /setEnabled\(pendingState, \{ silent: true \}\)/);
  assert.match(app, /cameraStreamingControl\.capability\.enabled,/);
});


test('ActiveSession disables camera streaming explicitly when the session ends without blocking completion', () => {
  const activeSession = readFileSync(resolve(process.cwd(), 'src/components/ActiveSession.tsx'), 'utf8');

  assert.match(activeSession, /cameraStreamingControl\?: Pick<CameraStreamingControlState, 'capability' \| 'setEnabled'>/);
  assert.match(activeSession, /cameraStreamingControl\.capability\.enabled !== true/);
  assert.match(activeSession, /void cameraStreamingControl\.setEnabled\(false, \{ silent: true \}\)\.catch/);
  assert.doesNotMatch(activeSession, /await cameraStreamingControl\.setEnabled\(false, \{ silent: true \}\);/);
  assert.doesNotMatch(activeSession, /await disableCameraStreamingAtSessionEnd\(\);/);
  assert.match(activeSession, /Failed to disable camera streaming at session end\./);
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
