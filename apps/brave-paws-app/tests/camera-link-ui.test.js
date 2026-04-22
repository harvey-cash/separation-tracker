import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('SessionConfig and ActiveSession use the shared camera link input', () => {
  const sessionConfig = readFileSync(resolve(process.cwd(), 'src/components/SessionConfig.tsx'), 'utf8');
  const activeSession = readFileSync(resolve(process.cwd(), 'src/components/ActiveSession.tsx'), 'utf8');

  assert.match(sessionConfig, /CameraLinkInput/);
  assert.match(sessionConfig, /full pairing link/i);
  assert.match(activeSession, /CameraLinkInput/);
  assert.match(activeSession, /Disconnect/);
  assert.match(activeSession, /Reconnect/);
  assert.match(activeSession, /Minimise/);
  assert.match(activeSession, /Maximise/);
  assert.match(activeSession, /Paste a camera URL to start the live preview/);
});

test('shared camera link input supports pairing-link or direct camera URL entry', () => {
  const cameraLinkInput = readFileSync(resolve(process.cwd(), 'src/components/CameraLinkInput.tsx'), 'utf8');

  assert.match(cameraLinkInput, /Scan QR Code/);
  assert.match(cameraLinkInput, /Brave Paws Streamer/);
  assert.match(cameraLinkInput, /Camera URL/);
  assert.match(cameraLinkInput, /https:\/\/demo\.trycloudflare\.com/);
  assert.match(cameraLinkInput, /Use Camera URL/);
});
