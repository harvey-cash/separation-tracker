import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readSessionStore, upsertSession, writeSessionStore } from '../src/storage.ts';

test('upsertSession preserves all records under concurrent writes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-storage-upsert-'));
  const filePath = path.join(tempDir, 'sessions.json');

  try {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => upsertSession(filePath, {
        id: `session-${index + 1}`,
        date: `2026-05-10T12:${String(index).padStart(2, '0')}:00.000Z`,
        steps: [{ id: 'step-1', durationSeconds: 30, status: 'completed' }],
        totalDurationSeconds: 30,
        status: 'completed',
      })),
    );

    const stored = await readSessionStore(filePath);
    assert.equal(stored.sessions.length, 20);
    assert.equal(new Set(stored.sessions.map((session) => session.id)).size, 20);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('writeSessionStore leaves no temp files behind after atomic write', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-storage-atomic-'));
  const filePath = path.join(tempDir, 'sessions.json');

  try {
    await writeSessionStore(filePath, [{
      id: 'session-1',
      date: '2026-05-10T12:00:00.000Z',
      steps: [{ id: 'step-1', durationSeconds: 30, status: 'completed' }],
      totalDurationSeconds: 30,
      status: 'completed',
    }]);

    const files = await fs.readdir(tempDir);
    assert.equal(files.some((file) => file.endsWith('.tmp')), false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
