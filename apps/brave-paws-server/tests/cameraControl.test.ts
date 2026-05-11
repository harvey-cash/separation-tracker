import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createCameraStreamingController } from '../src/cameraControl.ts';
import type { BravePawsServerConfig } from '../src/config.ts';

function makeConfig(overrides: Partial<BravePawsServerConfig> = {}): BravePawsServerConfig {
  return {
    host: '127.0.0.1',
    port: 4310,
    publicBaseUrl: null,
    landingBasePath: '/separation/',
    appBasePath: '/separation/app/',
    apiBasePath: '/separation/api/',
    cameraBasePath: '/separation/camera/',
    healthPath: '/separation/api/health',
    clientDiagnosticsPath: '/separation/api/client-diagnostics',
    landingDistDir: '/tmp/landing',
    appDistDir: '/tmp/app',
    dataDir: '/tmp/data',
    dataFilePath: '/tmp/data/sessions.json',
    pairingStoreFilePath: '/tmp/data/pairings.json',
    pairingEnabled: false,
    cameraUpstreamBaseUrl: 'http://127.0.0.1:18888/',
    cameraControlProvider: 'none',
    cameraControlLabel: 'Camera streaming',
    cameraControlStatusCommand: null,
    cameraControlEnableCommand: null,
    cameraControlDisableCommand: null,
    recordingProvider: 'none',
    recordingLabel: 'Session recording',
    recordingStatusCommand: null,
    recordingStartCommand: null,
    recordingStopCommand: null,
    authToken: null,
    corsAllowedOrigins: [],
    recordingsDir: '/tmp/data/recordings',
    ...overrides,
  };
}

test('createCameraStreamingController reports command-provider misconfiguration explicitly', async () => {
  const controller = createCameraStreamingController(makeConfig({
    cameraControlProvider: 'command',
    cameraControlEnableCommand: 'printf on\\n',
  }));

  const capability = await controller.getCapability();
  assert.equal(capability.provider, 'command');
  assert.equal(capability.supported, false);
  assert.equal(capability.canSetEnabled, false);
  assert.match(capability.detail || '', /missing status, disable commands/i);
});

test('setEnabled serializes command execution to avoid overlapping transitions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-camera-control-queue-'));
  const stateFilePath = path.join(tempDir, 'camera-state.txt');
  const logFilePath = path.join(tempDir, 'camera-ops.log');
  await fs.writeFile(stateFilePath, 'off\n');
  await fs.writeFile(logFilePath, '');

  const shellQuote = (value: string) => JSON.stringify(value);
  const controller = createCameraStreamingController(makeConfig({
    cameraControlProvider: 'command',
    cameraControlStatusCommand: `cat ${shellQuote(stateFilePath)}`,
    cameraControlEnableCommand: [
      `printf 'enable-start\\n' >> ${shellQuote(logFilePath)}`,
      'sleep 0.2',
      `printf 'on\\n' > ${shellQuote(stateFilePath)}`,
      `printf 'enable-end\\n' >> ${shellQuote(logFilePath)}`,
    ].join('; '),
    cameraControlDisableCommand: [
      `printf 'disable-start\\n' >> ${shellQuote(logFilePath)}`,
      'sleep 0.2',
      `printf 'off\\n' > ${shellQuote(stateFilePath)}`,
      `printf 'disable-end\\n' >> ${shellQuote(logFilePath)}`,
    ].join('; '),
  }));

  try {
    await Promise.all([
      controller.setEnabled(true),
      controller.setEnabled(false),
    ]);

    const operations = (await fs.readFile(logFilePath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean);

    assert.deepEqual(operations, [
      'enable-start',
      'enable-end',
      'disable-start',
      'disable-end',
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
