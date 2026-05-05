import test from 'node:test';
import assert from 'node:assert/strict';

import { getPairingTokenFromSearch, resolveCameraUrlFromPairingToken } from '../src/utils/pairingToken.ts';

test('getPairingTokenFromSearch returns safe opaque tokens only', () => {
  assert.equal(getPairingTokenFromSearch('?pairingToken=abc_DEF-1234567890'), 'abc_DEF-1234567890');
  assert.equal(getPairingTokenFromSearch('?pairingToken=bad%20token'), '');
  assert.equal(getPairingTokenFromSearch('?cameraUrl=https%3A%2F%2Fdemo.example%2Flive.stream'), '');
});

test('resolveCameraUrlFromPairingToken exchanges a token for a cached Brave Paws launch URL', async () => {
  const pairedUrl = await resolveCameraUrlFromPairingToken('?pairingToken=abc_DEF-1234567890', {
    apiBaseUrl: 'https://brave-paws.example/separation/api/',
    fetchImpl: async (input: string | URL | Request) => {
      assert.equal(String(input), 'https://brave-paws.example/separation/api/pairings/abc_DEF-1234567890');
      return new Response(JSON.stringify({
        cameraUrl: 'https://private.example/live.stream',
        profile: 'remote-low-latency',
        mode: 'mse,mp4,mjpeg',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.match(pairedUrl, /cameraUrl=https%3A%2F%2Fprivate\.example%2Flive\.stream/);
  assert.match(pairedUrl, /cameraProfile=remote-low-latency/);
});
