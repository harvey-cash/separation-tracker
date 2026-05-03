import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('App keeps the QUANTUM import callback stable across renders', () => {
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
