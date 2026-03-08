/**
 * Unit tests for sessionsToSheetRows / sheetRowsToSessions (Google Sheets
 * data conversion) in src/utils/export.ts.
 *
 * These functions are pure (no browser APIs), so no mocking is required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { sessionsToSheetRows, sheetRowsToSessions } from '../src/utils/export.ts';
import type { Session } from '../src/types.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-id-1',
    date: '2024-06-15T09:30:00.000Z',
    totalDurationSeconds: 635,
    anxietyScore: 0,
    exercisedLevel: 3,
    anyoneHome: 'Neighbor in living room',
    notes: 'Good day',
    completed: true,
    steps: [
      { id: 's1', durationSeconds: 30, completed: true },
      { id: 's2', durationSeconds: 60, completed: true },
      { id: 's3', durationSeconds: 480, completed: true },
    ],
    ...overrides,
  };
}

const SESSION = makeSession();

// ── sessionsToSheetRows ──────────────────────────────────────────────────────

test('sessionsToSheetRows produces the expected header row', () => {
  const rows = sessionsToSheetRows([]);
  assert.equal(rows.length, 1, 'should have only a header row for empty input');

  const header = rows[0];
  assert.equal(header[0], 'Date');
  assert.equal(header[1], 'Total Duration (s)');
  assert.equal(header[5], 'Anxiety Score');
  assert.equal(header[6], 'Notes');
  assert.equal(header[7], 'Exercised Level');
  assert.equal(header[8], 'Anyone Home');
  assert.equal(header[9], 'Step 1 Duration (s)');
  assert.equal(header.length, 19);
});

test('sessionsToSheetRows encodes anxiety scores as text labels', () => {
  const calm = sessionsToSheetRows([makeSession({ anxietyScore: 0 })])[1];
  const coping = sessionsToSheetRows([makeSession({ anxietyScore: 1 })])[1];
  const panicking = sessionsToSheetRows([makeSession({ anxietyScore: 2 })])[1];

  assert.equal(calm[5], 'Calm');
  assert.equal(coping[5], 'Coping');
  assert.equal(panicking[5], 'Panicking');
});

test('sessionsToSheetRows stores numeric values as numbers', () => {
  const rows = sessionsToSheetRows([SESSION]);
  const dataRow = rows[1];

  assert.equal(typeof dataRow[1], 'number', 'totalDuration should be a number');
  assert.equal(typeof dataRow[2], 'number', 'maxStepDuration should be a number');
  assert.equal(typeof dataRow[3], 'number', 'completedSteps should be a number');
  assert.equal(typeof dataRow[4], 'number', 'totalSteps should be a number');
  assert.equal(typeof dataRow[9], 'number', 'step duration should be a number');
});

// ── sheetRowsToSessions ──────────────────────────────────────────────────────

test('sheetRowsToSessions returns empty array for header-only input', () => {
  const rows = sessionsToSheetRows([]);
  assert.deepEqual(sheetRowsToSessions(rows), []);
});

test('sheetRowsToSessions returns empty array for completely empty input', () => {
  assert.deepEqual(sheetRowsToSessions([]), []);
});

// ── Roundtrip tests ──────────────────────────────────────────────────────────

test('roundtrip preserves step durations and count', () => {
  const rows = sessionsToSheetRows([SESSION]);
  const [restored] = sheetRowsToSessions(rows);

  assert.equal(restored.steps.length, SESSION.steps.length);
  restored.steps.forEach((step, i) => {
    assert.equal(step.durationSeconds, SESSION.steps[i].durationSeconds);
  });
});

test('roundtrip preserves anxiety score', () => {
  const rows = sessionsToSheetRows([SESSION]);
  const [restored] = sheetRowsToSessions(rows);
  assert.equal(restored.anxietyScore, SESSION.anxietyScore);
});

test('roundtrip preserves notes', () => {
  const session = makeSession({ notes: 'Great session, very calm!' });
  const [restored] = sheetRowsToSessions(sessionsToSheetRows([session]));
  assert.equal(restored.notes, session.notes);
});

test('roundtrip preserves exercise level', () => {
  const session = makeSession({ exercisedLevel: 5 });
  const [restored] = sheetRowsToSessions(sessionsToSheetRows([session]));
  assert.equal(restored.exercisedLevel, session.exercisedLevel);
});

test('roundtrip preserves anyone home field', () => {
  const session = makeSession({ anyoneHome: 'Dog walker dropped in' });
  const [restored] = sheetRowsToSessions(sessionsToSheetRows([session]));
  assert.equal(restored.anyoneHome, session.anyoneHome);
});

test('roundtrip preserves total duration and completed status', () => {
  const rows = sessionsToSheetRows([SESSION]);
  const [restored] = sheetRowsToSessions(rows);
  assert.equal(restored.totalDurationSeconds, SESSION.totalDurationSeconds);
  assert.equal(restored.completed, true);
});

test('roundtrip handles multiple sessions', () => {
  const session2 = makeSession({
    id: 'test-id-2',
    anxietyScore: 2,
    exercisedLevel: undefined,
    anyoneHome: '',
    notes: '',
    steps: [{ id: 'x', durationSeconds: 120, completed: false }],
  });
  const restored = sheetRowsToSessions(sessionsToSheetRows([SESSION, session2]));
  assert.equal(restored.length, 2);
  assert.equal(restored[1].anxietyScore, 2);
  assert.equal(restored[1].exercisedLevel, undefined);
  assert.equal(restored[1].anyoneHome, '');
  assert.equal(restored[1].steps[0].durationSeconds, 120);
});

test('roundtrip preserves notes with special characters', () => {
  const session = makeSession({ notes: 'He said "good boy" & wagged tail' });
  const [restored] = sheetRowsToSessions(sessionsToSheetRows([session]));
  assert.equal(restored.notes, session.notes);
});
