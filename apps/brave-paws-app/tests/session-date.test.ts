import test from 'node:test';
import assert from 'node:assert/strict';

import { applySessionCalendarDate } from '../src/utils/sessionDate.ts';

test('applySessionCalendarDate preserves the original time when the date is unchanged', () => {
  const original = '2026-05-13T15:37:53.790Z';
  const updated = applySessionCalendarDate(original, '2026-05-13');

  assert.equal(updated, original);
});

test('applySessionCalendarDate updates the calendar date without zeroing the time of day', () => {
  const original = '2026-05-13T15:37:53.790Z';
  const updated = applySessionCalendarDate(original, '2026-05-11');

  assert.equal(updated, '2026-05-11T15:37:53.790Z');
});
