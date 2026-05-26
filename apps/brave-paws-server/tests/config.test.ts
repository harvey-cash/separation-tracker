import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from '../src/config.ts';

test('resolveConfig defaults recordingsDir under the data dir', () => {
  const config = resolveConfig({
    BRAVE_PAWS_DATA_DIR: '/tmp/brave-paws-data',
  });

  assert.equal(config.dataDir, '/tmp/brave-paws-data');
  assert.equal(config.recordingsDir, '/tmp/brave-paws-data/recordings');
});

test('resolveConfig allows recordingsDir to live outside the data dir', () => {
  const config = resolveConfig({
    BRAVE_PAWS_DATA_DIR: '/tmp/brave-paws-data',
    BRAVE_PAWS_RECORDINGS_DIR: '/tmp/brave-paws-archive/recordings',
  });

  assert.equal(config.dataDir, '/tmp/brave-paws-data');
  assert.equal(config.recordingsDir, '/tmp/brave-paws-archive/recordings');
});
