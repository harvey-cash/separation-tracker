import test from 'node:test';
import assert from 'node:assert/strict';

import type { Session } from '../src/types';
import { getRecentSessions } from '../src/components/Dashboard';
import { getGraphData } from '../src/components/GraphView';

test('getRecentSessions includes aborted sessions in dashboard recents', () => {
  const sessions: Session[] = [
    {
      id: 'completed-session',
      date: '2024-05-01T10:00:00.000Z',
      totalDurationSeconds: 60,
      anxietyScore: 0,
      status: 'completed',
      steps: [{ id: 'step-1', durationSeconds: 60, status: 'completed' }],
    },
    {
      id: 'aborted-session',
      date: '2024-05-03T10:00:00.000Z',
      totalDurationSeconds: 90,
      anxietyScore: 2,
      status: 'aborted',
      steps: [{ id: 'step-2', durationSeconds: 90, status: 'aborted' }],
    },
    {
      id: 'pending-session',
      date: '2024-05-02T10:00:00.000Z',
      totalDurationSeconds: 45,
      status: 'pending',
      steps: [{ id: 'step-3', durationSeconds: 45, status: 'pending' }],
    },
  ];

  assert.deepEqual(
    getRecentSessions(sessions).map((session) => session.id),
    ['aborted-session', 'pending-session', 'completed-session']
  );
});

test('getGraphData includes aborted sessions and aborted step durations', () => {
  const sessions: Session[] = [
    {
      id: 'mixed-status-session',
      date: '2024-05-01T10:00:00.000Z',
      totalDurationSeconds: 150,
      anxietyScore: 1,
      status: 'completed',
      steps: [
        { id: 'step-1', durationSeconds: 30, status: 'completed' },
        { id: 'step-2', durationSeconds: 120, status: 'aborted' },
      ],
    },
    {
      id: 'aborted-session',
      date: '2024-05-02T10:00:00.000Z',
      totalDurationSeconds: 90,
      anxietyScore: 2,
      status: 'aborted',
      steps: [{ id: 'step-3', durationSeconds: 90, status: 'aborted' }],
    },
  ];

  assert.deepEqual(
    getGraphData(sessions).map(({ maxDurationMinutes, score }) => ({ maxDurationMinutes, score })),
    [
      { maxDurationMinutes: 2, score: 1 },
      { maxDurationMinutes: 1.5, score: 2 },
    ]
  );
});
