import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildHostedUiLaunchUrl, buildHostedUiOpenCommandArgs } = require('../windows-camera-helper-ui/loopback-contract.cjs');

test('buildHostedUiLaunchUrl preserves the full hosted UI fragment', () => {
  const launchUrl = buildHostedUiLaunchUrl({
    port: 4380,
    token: 'launch-token',
  });

  assert.equal(
    launchUrl,
    'https://harvey.cash/separation/streamer/#loopback=http%3A%2F%2F127.0.0.1%3A4380&token=launch-token&platform=windows&protocol=1.0',
  );
});

test('buildHostedUiOpenCommandArgs quotes the hosted UI URL for cmd.exe', () => {
  const launchUrl = buildHostedUiLaunchUrl({
    port: 4380,
    token: 'launch-token',
  });

  assert.deepEqual(buildHostedUiOpenCommandArgs(launchUrl), [
    '/c',
    'start',
    '',
    '"https://harvey.cash/separation/streamer/#loopback=http%3A%2F%2F127.0.0.1%3A4380&token=launch-token&platform=windows&protocol=1.0"',
  ]);
});
