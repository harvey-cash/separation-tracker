import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('INFO.md explains below-threshold, cue-less gradual desensitisation', () => {
  const info = readFileSync(resolve(process.cwd(), 'INFO.md'), 'utf8');

  assert.match(info, /gradual desensitisation/i);
  assert.match(info, /below the anxiety threshold|below-threshold/i);
  assert.match(info, /cue-less/i);
  assert.match(info, /what is brave paws for\?/i);
});
