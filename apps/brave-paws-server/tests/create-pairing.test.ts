import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(__dirname, '..');

async function runCreatePairing(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('npm', ['run', 'create-pairing', '--', ...args], {
      cwd: workspaceDir,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('create-pairing CLI succeeds with token-only output when no public base URL is configured', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-create-pairing-cli-'));

  try {
    const result = await runCreatePairing([
      '--camera-url',
      'https://private.example/live.stream',
    ], {
      BRAVE_PAWS_ENABLE_PAIRING: 'true',
      BRAVE_PAWS_DATA_DIR: tempDir,
      BRAVE_PAWS_PUBLIC_BASE_URL: '',
    });

    assert.equal(result.code, 0);
    assert.match(result.stderr, /no absolute URL could be printed/i);
    const token = result.stdout.trim().split(/\r?\n/).at(-1) || '';
    assert.match(token, /^[A-Za-z0-9_-]{10,200}$/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
