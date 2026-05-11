import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Dashboard keeps training available locally and describes connected features generically', () => {
  const dashboard = readFileSync(resolve(process.cwd(), 'src/components/Dashboard.tsx'), 'utf8');

  assert.match(dashboard, /recentSessions\.length === 0[\s\S]*New to separation anxiety training\?/);
  assert.match(dashboard, /recentSessions\.length > 0[\s\S]*About separation anxiety training/);
  assert.match(dashboard, /cameraStreamingControl/);
  assert.match(dashboard, /Remote features unavailable/);
  assert.match(dashboard, /Training still works locally on this device/);
  assert.doesNotMatch(dashboard, /disabled=\{isBackendUnavailable\}/);
  assert.match(dashboard, /Works locally now · syncs later when the server is back/);
  assert.match(dashboard, /Connected features/);
  assert.match(dashboard, /automatic sync/);
  assert.match(dashboard, /remote camera control/);
  assert.match(dashboard, /session recording/);
  assert.match(dashboard, /without a separate companion app/);
});
