export type TimerClock = {
  startedAt: number | null;
  accumulatedMs: number;
};

export function getElapsedSeconds(clock: TimerClock, now = Date.now()) {
  const runningMs = clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt);
  return Math.floor((clock.accumulatedMs + runningMs) / 1000);
}

export function getRemainingSeconds(durationSeconds: number, clock: TimerClock, now = Date.now()) {
  return Math.max(0, durationSeconds - getElapsedSeconds(clock, now));
}

export function pauseTimer(clock: TimerClock, now = Date.now()): TimerClock {
  if (clock.startedAt === null) {
    return clock;
  }

  return {
    startedAt: null,
    accumulatedMs: clock.accumulatedMs + Math.max(0, now - clock.startedAt),
  };
}

export function startTimer(clock: TimerClock, now = Date.now()): TimerClock {
  if (clock.startedAt !== null) {
    return clock;
  }

  return {
    ...clock,
    startedAt: now,
  };
}
