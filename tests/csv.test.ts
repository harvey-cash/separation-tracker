/**
 * Unit tests for src/utils/export.ts (generateCSVContent / parseCSV)
 *
 * These functions are pure (no browser APIs), so no mocking is required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { generateCSVContent, parseCSV } from '../src/utils/export.ts';
import type { Session } from '../src/types.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Build a complete Session with sensible defaults, overridable per-test. */
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-id-1',
    date: '2024-06-15T09:30:00.000Z',
    totalDurationSeconds: 635,
    anxietyScore: 0,
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

// ── generateCSVContent ────────────────────────────────────────────────────────

test('generateCSVContent produces the expected header row', () => {
  const csv = generateCSVContent([]);
  const [header] = csv.split('\n');
  const cols = header.split(',');

  assert.equal(cols[0], 'Date');
  assert.equal(cols[1], 'Total Duration (s)');
  assert.equal(cols[5], 'Anxiety Score');
  assert.equal(cols[6], 'Notes');
  assert.equal(cols[7], 'Step 1 Duration (s)');
  // 17 columns total: 7 fixed + 10 step columns
  assert.equal(cols.length, 17);
});

test('generateCSVContent encodes anxiety scores as text labels', () => {
  const calm = parseCSVRow(generateCSVContent([makeSession({ anxietyScore: 0 })]));
  const coping = parseCSVRow(generateCSVContent([makeSession({ anxietyScore: 1 })]));
  const panicking = parseCSVRow(generateCSVContent([makeSession({ anxietyScore: 2 })]));

  assert.equal(calm[5], 'Calm');
  assert.equal(coping[5], 'Coping');
  assert.equal(panicking[5], 'Panicking');
});

test('generateCSVContent escapes double-quotes in notes', () => {
  const session = makeSession({ notes: 'He said "good boy"' });
  const csv = generateCSVContent([session]);
  assert.ok(csv.includes('"He said ""good boy"""'), 'quotes should be doubled');
});

// ── parseCSV ──────────────────────────────────────────────────────────────────

test('parseCSV returns an empty array for header-only input', () => {
  const csv = generateCSVContent([]);
  assert.deepEqual(parseCSV(csv), []);
});

test('parseCSV returns an empty array for completely empty input', () => {
  assert.deepEqual(parseCSV(''), []);
  assert.deepEqual(parseCSV('   '), []);
});

// ── generateCSVContent / parseCSV roundtrip ───────────────────────────────────

test('roundtrip preserves step durations and count', () => {
  const csv = generateCSVContent([SESSION]);
  const [restored] = parseCSV(csv);

  assert.equal(restored.steps.length, SESSION.steps.length);
  restored.steps.forEach((step, i) => {
    assert.equal(step.durationSeconds, SESSION.steps[i].durationSeconds);
  });
});

test('roundtrip preserves anxiety score', () => {
  const csv = generateCSVContent([SESSION]);
  const [restored] = parseCSV(csv);
  assert.equal(restored.anxietyScore, SESSION.anxietyScore);
});

test('roundtrip preserves notes (including special characters)', () => {
  const session = makeSession({ notes: 'Great session, very calm!' });
  const [restored] = parseCSV(generateCSVContent([session]));
  assert.equal(restored.notes, session.notes);
});

test('roundtrip preserves notes containing double-quotes', () => {
  const session = makeSession({ notes: 'He said "good boy"' });
  const [restored] = parseCSV(generateCSVContent([session]));
  assert.equal(restored.notes, session.notes);
});

test('roundtrip preserves total duration and completed status', () => {
  const csv = generateCSVContent([SESSION]);
  const [restored] = parseCSV(csv);
  assert.equal(restored.totalDurationSeconds, SESSION.totalDurationSeconds);
  assert.equal(restored.completed, true);
});

test('roundtrip handles multiple sessions', () => {
  const session2 = makeSession({
    id: 'test-id-2',
    anxietyScore: 2,
    notes: '',
    steps: [{ id: 'x', durationSeconds: 120, completed: false }],
  });
  const restored = parseCSV(generateCSVContent([SESSION, session2]));
  assert.equal(restored.length, 2);
  assert.equal(restored[1].anxietyScore, 2);
  assert.equal(restored[1].steps[0].durationSeconds, 120);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns columns from the first data row of a CSV string. */
function parseCSVRow(csv: string): string[] {
  const lines = csv.split('\n');
  // lines[0] = header, lines[1] = first data row
  const row = lines[1];
  const cols: string[] = [];
  const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
  let m;
  while ((m = regex.exec(row)) !== null) {
    cols.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : m[2]);
  }
  return cols;
}
