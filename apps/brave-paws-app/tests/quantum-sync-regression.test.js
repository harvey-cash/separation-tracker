import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('App keeps the session import callback stable across renders', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  assert.match(appSource, /useState, useEffect, useCallback/);
  assert.match(appSource, /const handleImportSessions = useCallback\(/);
});

test('useQuantumSync dereferences onReplaceSessions through a ref instead of effect dependencies', () => {
  const hookSource = readFileSync(resolve(process.cwd(), 'src/hooks/useQuantumSync.ts'), 'utf8');

  assert.match(hookSource, /const onReplaceSessionsRef = useRef\(onReplaceSessions\);/);
  assert.match(hookSource, /onReplaceSessionsRef\.current = onReplaceSessions;/);
  assert.match(hookSource, /onReplaceSessionsRef\.current\(nextSessions\);/);
  assert.doesNotMatch(hookSource, /\[finishSuccess, onReplaceSessions, pullSessions, scheduleAutoPush\]/);
});


test('useQuantumSync rehydrates on pageshow as well as the existing resume signals', () => {
  const hookSource = readFileSync(resolve(process.cwd(), 'src/hooks/useQuantumSync.ts'), 'utf8');

  assert.match(hookSource, /window\.addEventListener\('focus', handleResume\);/);
  assert.match(hookSource, /window\.addEventListener\('online', handleResume\);/);
  assert.match(hookSource, /window\.addEventListener\('pageshow', handleResume\);/);
  assert.match(hookSource, /document\.addEventListener\('visibilitychange', handleResume\);/);
  assert.match(hookSource, /window\.removeEventListener\('pageshow', handleResume\);/);
});
