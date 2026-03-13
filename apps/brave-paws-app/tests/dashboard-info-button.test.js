import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Dashboard includes prominent and subtle info entry points', () => {
  const dashboard = readFileSync(resolve(process.cwd(), 'src/components/Dashboard.tsx'), 'utf8');

  assert.match(dashboard, /recentSessions\.length === 0[\s\S]*New to separation anxiety training\?/);
  assert.match(dashboard, /recentSessions\.length > 0[\s\S]*About separation anxiety training/);
});
