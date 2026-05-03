import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldSendDiagnosticFingerprint } from '../src/utils/clientDiagnostics.ts';

test('shouldSendDiagnosticFingerprint allows a fresh event and suppresses duplicates inside the dedupe window', () => {
  const recent = new Map<string, number>();
  const now = 1_000;

  assert.equal(shouldSendDiagnosticFingerprint(recent, 'preview-timeout', now, 0), true);
  recent.set('preview-timeout', now);
  assert.equal(shouldSendDiagnosticFingerprint(recent, 'preview-timeout', now + 5_000, 1), false);
  assert.equal(shouldSendDiagnosticFingerprint(recent, 'preview-timeout', now + 61_000, 1), true);
});

test('shouldSendDiagnosticFingerprint enforces the per-page volume cap', () => {
  const recent = new Map<string, number>();

  assert.equal(
    shouldSendDiagnosticFingerprint(recent, 'quantum-sync-error', 1_000, 12, { maxEventsPerWindow: 12 }),
    false,
  );
});
