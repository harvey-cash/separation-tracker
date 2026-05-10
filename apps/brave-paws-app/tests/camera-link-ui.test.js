import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('SessionConfig and ActiveSession use the shared camera link input', () => {
  const sessionConfig = readFileSync(resolve(process.cwd(), 'src/components/SessionConfig.tsx'), 'utf8');
  const activeSession = readFileSync(resolve(process.cwd(), 'src/components/ActiveSession.tsx'), 'utf8');

  assert.match(sessionConfig, /CameraLinkInput/);
  assert.match(sessionConfig, /one-time pairing link/i);
  assert.match(activeSession, /CameraLinkInput/);
  assert.match(activeSession, /Disconnect/);
  assert.match(activeSession, /Reconnect/);
  assert.match(activeSession, /Minimise/);
  assert.match(activeSession, /Maximise/);
  assert.match(activeSession, /one-time pairing link/i);
  assert.match(activeSession, /suggested picam link/i);
});

test('shared camera link input supports QR, suggested picam, and direct stream URL entry', () => {
  const cameraLinkInput = readFileSync(resolve(process.cwd(), 'src/components/CameraLinkInput.tsx'), 'utf8');

  assert.match(cameraLinkInput, /Scan QR Code/);
  assert.match(cameraLinkInput, /Use suggested picam/);
  assert.match(cameraLinkInput, /Stream URL/);
  assert.match(cameraLinkInput, /https:\/\/camera\.example\/live\.stream\//);
  assert.match(cameraLinkInput, /Use Stream URL/);
});
