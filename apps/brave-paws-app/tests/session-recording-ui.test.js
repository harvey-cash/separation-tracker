import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('session recording UI is surfaced during active sessions and in history/detail views', () => {
  const activeSession = readFileSync(resolve(process.cwd(), 'src/components/ActiveSession.tsx'), 'utf8');
  const sessionView = readFileSync(resolve(process.cwd(), 'src/components/SessionView.tsx'), 'utf8');
  const historyList = readFileSync(resolve(process.cwd(), 'src/components/HistoryList.tsx'), 'utf8');

  assert.match(activeSession, /Starting recording|Recording session|Recording saved|Recording unavailable/);
  assert.match(activeSession, /startSessionRecording/);
  assert.match(activeSession, /stopSessionRecording/);
  assert.match(sessionView, /Session Recording/);
  assert.match(sessionView, /Open recording/);
  assert.match(historyList, /Recording/);
});
