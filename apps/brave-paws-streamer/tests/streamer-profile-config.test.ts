import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('windows adapter includes profile-specific remote encoding templates', () => {
  const adapter = readFileSync(resolve(process.cwd(), 'windows-camera-helper-ui/windows-adapter.cjs'), 'utf8');

  assert.match(adapter, /brave_paws_h264_low_latency/);
  assert.match(adapter, /brave_paws_h264_resilient/);
  assert.match(adapter, /brave_paws_aac_low_latency/);
  assert.match(adapter, /brave_paws_aac_resilient/);
  assert.match(adapter, /Remote low-latency profile enabled/);
  assert.match(adapter, /Remote resilient profile enabled/);
  assert.match(adapter, /writeConfig\(videoDevice, audioDevice, state\.preview\.remoteProfile\)/);
});