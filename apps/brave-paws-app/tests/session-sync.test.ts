import test from 'node:test';
import assert from 'node:assert/strict';

import type { Session } from '../src/types.ts';
import { mergeSessionsById, serializeSessionsForComparison } from '../src/utils/sessionSync.ts';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    date: '2026-05-03T09:00:00.000Z',
    totalDurationSeconds: 30,
    anxietyScore: 0,
    exercisedLevel: 2,
    anyoneHome: '',
    notes: '',
    status: 'completed',
    steps: [{ id: 'step-1', durationSeconds: 30, status: 'completed' }],
    ...overrides,
  };
}

test('mergeSessionsById keeps remote sessions and appends local-only sessions', () => {
  const remote = [makeSession({ id: 'remote-1', date: '2026-05-01T09:00:00.000Z' })];
  const local = [makeSession({ id: 'local-1', date: '2026-05-02T09:00:00.000Z' })];

  const merged = mergeSessionsById(remote, local, { prefer: 'secondary' });

  assert.deepEqual(merged.map((session) => session.id), ['local-1', 'remote-1']);
});

test('mergeSessionsById prefers local copies for matching ids when requested', () => {
  const remote = [makeSession({ id: 'shared', notes: 'remote' })];
  const local = [makeSession({ id: 'shared', notes: 'local' })];

  const merged = mergeSessionsById(remote, local, { prefer: 'secondary' });

  assert.equal(merged[0]?.notes, 'local');
});

test('serializeSessionsForComparison ignores input ordering differences', () => {
  const first = [
    makeSession({ id: 'b', date: '2026-05-01T09:00:00.000Z' }),
    makeSession({ id: 'a', date: '2026-05-02T09:00:00.000Z' }),
  ];
  const second = [
    makeSession({ id: 'a', date: '2026-05-02T09:00:00.000Z' }),
    makeSession({ id: 'b', date: '2026-05-01T09:00:00.000Z' }),
  ];

  assert.equal(serializeSessionsForComparison(first), serializeSessionsForComparison(second));
});
