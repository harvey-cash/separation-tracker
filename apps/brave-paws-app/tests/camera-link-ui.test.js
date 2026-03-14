import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('SessionConfig and ActiveSession use the shared camera link input', () => {
  const sessionConfig = readFileSync(resolve(process.cwd(), 'src/components/SessionConfig.tsx'), 'utf8');
  const activeSession = readFileSync(resolve(process.cwd(), 'src/components/ActiveSession.tsx'), 'utf8');

  assert.match(sessionConfig, /CameraLinkInput/);
  assert.match(activeSession, /CameraLinkInput/);
  assert.match(activeSession, /buildPreviewFallbackUrls/);
  assert.match(activeSession, /Remote preview is delayed or stalled/);
  assert.match(activeSession, /Retrying remote preview/);
});

test('shared camera link input exposes Brave Paws Streamer scan messaging', () => {
  const cameraLinkInput = readFileSync(resolve(process.cwd(), 'src/components/CameraLinkInput.tsx'), 'utf8');

  assert.match(cameraLinkInput, /Scan QR Code/);
  assert.match(cameraLinkInput, /Brave Paws Streamer/);
  assert.match(cameraLinkInput, /Use This Stream/);
});