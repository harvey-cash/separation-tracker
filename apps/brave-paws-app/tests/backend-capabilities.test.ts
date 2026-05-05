import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchBackendCapabilities,
  setCameraStreamingEnabled,
  UNSUPPORTED_CAMERA_STREAMING_CAPABILITY,
} from '../src/utils/backendCapabilities.ts';

test('fetchBackendCapabilities reads the shared capabilities endpoint', async () => {
  const capabilities = await fetchBackendCapabilities((async (input: string | URL | Request) => {
    assert.equal(String(input), 'https://brave-paws.example/separation/api/capabilities');
    return new Response(JSON.stringify({
      cameraStreaming: {
        ...UNSUPPORTED_CAMERA_STREAMING_CAPABILITY,
        supported: true,
        canSetEnabled: true,
        enabled: false,
        provider: 'command',
        detail: null,
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch, 'https://brave-paws.example/separation/api/');

  assert.equal(capabilities.cameraStreaming.supported, true);
  assert.equal(capabilities.cameraStreaming.enabled, false);
  assert.equal(capabilities.cameraStreaming.provider, 'command');
});

test('setCameraStreamingEnabled posts the desired enabled state to the shared capability endpoint', async () => {
  const capability = await setCameraStreamingEnabled(true, (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), 'https://brave-paws.example/separation/api/capabilities/camera-streaming');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.headers && (init.headers as Record<string, string>)['content-type'], 'application/json');
    assert.equal(init?.body, JSON.stringify({ enabled: true }));

    return new Response(JSON.stringify({
      ...UNSUPPORTED_CAMERA_STREAMING_CAPABILITY,
      supported: true,
      canSetEnabled: true,
      enabled: true,
      provider: 'command',
      detail: null,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch, 'https://brave-paws.example/separation/api/');

  assert.equal(capability.enabled, true);
  assert.equal(capability.supported, true);
});
