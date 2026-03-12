import test from 'node:test';
import assert from 'node:assert/strict';

import { getElapsedSeconds, getRemainingSeconds, pauseTimer, startTimer } from '../src/utils/timer.ts';

test('getElapsedSeconds uses wall clock time even if interval ticks are missed', () => {
  const startedClock = startTimer({ startedAt: null, accumulatedMs: 0 }, 1_000);

  assert.equal(getElapsedSeconds(startedClock, 15_000), 14);
});

test('pauseTimer preserves elapsed time across pause and resume gaps', () => {
  const runningClock = startTimer({ startedAt: null, accumulatedMs: 0 }, 1_000);
  const pausedClock = pauseTimer(runningClock, 5_000);
  const resumedClock = startTimer(pausedClock, 20_000);

  assert.equal(getElapsedSeconds(resumedClock, 24_000), 8);
});

test('getRemainingSeconds never drops below zero', () => {
  const runningClock = startTimer({ startedAt: null, accumulatedMs: 0 }, 10_000);

  assert.equal(getRemainingSeconds(60, runningClock, 25_000), 45);
  assert.equal(getRemainingSeconds(60, runningClock, 75_000), 0);
});
