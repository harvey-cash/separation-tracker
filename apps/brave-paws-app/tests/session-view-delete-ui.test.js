import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('session edit page exposes a destructive delete action', () => {
  const sessionView = readFileSync(resolve(process.cwd(), 'src/components/SessionView.tsx'), 'utf8');

  assert.match(sessionView, /onDelete: \(sessionId: string\) => void;/);
  assert.match(sessionView, /window\.confirm\('Delete this session\? This cannot be undone\.'/);
  assert.match(sessionView, /Delete session/);
  assert.match(sessionView, /Danger Zone/);
  assert.match(sessionView, /onDelete\(session\.id\);/);
});

test('App returns to the previous view after deleting from the session edit page', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  assert.match(app, /onDelete=\{\(sessionId\) => \{/);
  assert.match(app, /deleteSession\(sessionId\);/);
  assert.match(app, /setActiveSession\(null\);/);
  assert.match(app, /setCurrentView\(previousView\);/);
});
