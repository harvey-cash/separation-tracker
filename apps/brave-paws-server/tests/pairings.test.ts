import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { consumePairing, createPairing } from '../src/pairings.ts';

test('createPairing rejects camera URLs with embedded credentials', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-pairings-credentials-'));
  const filePath = path.join(tempDir, 'pairings.json');

  try {
    await assert.rejects(
      createPairing(filePath, {
        cameraUrl: 'https://user:pass@private.example/live.stream',
      }),
      /without embedded credentials/,
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createPairing preserves every token under concurrent creation', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-pairings-create-'));
  const filePath = path.join(tempDir, 'pairings.json');

  try {
    const records = await Promise.all(
      Array.from({ length: 20 }, () => createPairing(filePath, {
        cameraUrl: 'https://private.example/live.stream',
        profile: 'remote-low-latency',
        mode: 'mse,mp4,mjpeg',
      })),
    );

    const stored = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
      pairings: Array<{ token: string; launchConfig: { cameraUrl: string } }>;
    };

    assert.equal(records.length, 20);
    assert.equal(stored.pairings.length, 20);
    assert.equal(new Set(records.map((record) => record.token)).size, 20);
    assert.equal(new Set(stored.pairings.map((record) => record.token)).size, 20);
    assert.ok(stored.pairings.every((record) => record.launchConfig.cameraUrl === 'https://private.example/live.stream'));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('consumePairing only succeeds once under concurrent reads', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-pairings-consume-'));
  const filePath = path.join(tempDir, 'pairings.json');

  try {
    const created = await createPairing(filePath, {
      cameraUrl: 'https://private.example/live.stream',
      profile: 'remote-low-latency',
      mode: 'mse,mp4,mjpeg',
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumePairing(filePath, created.token)),
    );

    assert.equal(results.filter(Boolean).length, 1);

    const stored = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
      pairings: Array<{ token: string; consumedAt: string | null }>;
    };
    const storedRecord = stored.pairings.find((record) => record.token === created.token);
    assert.ok(storedRecord?.consumedAt);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('consumePairing rejects excessively long tokens', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-pairings-token-length-'));
  const filePath = path.join(tempDir, 'pairings.json');

  try {
    const created = await createPairing(filePath, {
      cameraUrl: 'https://private.example/live.stream',
      profile: 'remote-low-latency',
      mode: 'mse,mp4,mjpeg',
    });

    assert.equal(await consumePairing(filePath, `${created.token}${'a'.repeat(201)}`), null);
    assert.ok(await consumePairing(filePath, created.token));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
