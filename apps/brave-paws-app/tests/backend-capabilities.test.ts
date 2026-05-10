import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchBackendCapabilities,
  fetchSessionRecordingCapability,
  setCameraStreamingEnabled,
  startSessionRecording,
  stopSessionRecording,
  UNSUPPORTED_CAMERA_STREAMING_CAPABILITY,
  UNSUPPORTED_SESSION_RECORDING_CAPABILITY,
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
      sessionRecording: {
        ...UNSUPPORTED_SESSION_RECORDING_CAPABILITY,
        supported: true,
        canStart: true,
        canStop: true,
        active: false,
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
  assert.equal(capabilities.sessionRecording.supported, true);
  assert.equal(capabilities.sessionRecording.canStart, true);
  assert.equal(capabilities.sessionRecording.provider, 'command');
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

test('fetchBackendCapabilities hides raw HTML error bodies when the API is unreachable', async () => {
  await assert.rejects(
    fetchBackendCapabilities((async () => new Response('<!DOCTYPE html><html><body>nope</body></html>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })) as typeof fetch, 'https://brave-paws.example/separation/api/'),
    /QUANTUM is not reachable right now\./,
  );
});

test('fetchSessionRecordingCapability reads the dedicated recording capability endpoint', async () => {
  const capability = await fetchSessionRecordingCapability((async (input: string | URL | Request) => {
    assert.equal(String(input), 'https://brave-paws.example/separation/api/capabilities/recording');
    return new Response(JSON.stringify({
      ...UNSUPPORTED_SESSION_RECORDING_CAPABILITY,
      supported: true,
      canStart: true,
      canStop: true,
      active: true,
      sessionId: 'session-123',
      provider: 'command',
      recording: {
        status: 'recording',
        sessionId: 'session-123',
        provider: 'command',
        hasAudio: true,
      },
      detail: null,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch, 'https://brave-paws.example/separation/api/');

  assert.equal(capability.active, true);
  assert.equal(capability.sessionId, 'session-123');
  assert.equal(capability.recording?.status, 'recording');
});

test('startSessionRecording posts the session payload to the recording start endpoint', async () => {
  const capability = await startSessionRecording(
    { sessionId: 'session-abc', sessionDate: '2026-05-09T18:00:00.000Z', sessionStatus: 'pending' },
    (async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), 'https://brave-paws.example/separation/api/recording/start');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, JSON.stringify({ sessionId: 'session-abc', sessionDate: '2026-05-09T18:00:00.000Z', sessionStatus: 'pending' }));

      return new Response(JSON.stringify({
        ...UNSUPPORTED_SESSION_RECORDING_CAPABILITY,
        supported: true,
        canStart: true,
        canStop: true,
        active: true,
        sessionId: 'session-abc',
        provider: 'command',
        recording: {
          status: 'recording',
          sessionId: 'session-abc',
          provider: 'command',
        },
        detail: null,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
    'https://brave-paws.example/separation/api/',
  );

  assert.equal(capability.active, true);
  assert.equal(capability.sessionId, 'session-abc');
});

test('setCameraStreamingEnabled hides non-JSON gateway errors behind a safe message', async () => {
  await assert.rejects(
    setCameraStreamingEnabled(true, (async () => new Response('<html><head><title>405 Not Allowed</title></head></html>', {
      status: 405,
      headers: { 'content-type': 'text/html' },
    })) as typeof fetch, 'https://brave-paws.example/separation/api/'),
    /QUANTUM is not reachable right now\./,
  );
});

test('stopSessionRecording posts the stop payload to the recording stop endpoint', async () => {
  const capability = await stopSessionRecording(
    {
      sessionId: 'session-abc',
      disposition: 'save',
      sessionSnapshot: {
        id: 'session-abc',
        date: '2026-05-09T18:00:00.000Z',
        totalDurationSeconds: 75,
        status: 'completed',
        steps: [
          { id: 'step-1', durationSeconds: 30, status: 'completed' },
          { id: 'step-2', durationSeconds: 45, status: 'completed' },
        ],
      },
      timelineEvents: [
        {
          sequence: 0,
          type: 'session_started',
          occurredAt: '2026-05-09T18:00:00.000Z',
          sessionElapsedSeconds: 0,
          sessionRunning: true,
          currentStepIndex: 0,
          stepId: 'step-1',
          stepStatus: 'pending',
          stepRunning: false,
          stepElapsedSeconds: 0,
          stepDurationSeconds: 30,
        },
      ],
    },
    (async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), 'https://brave-paws.example/separation/api/recording/stop');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, JSON.stringify({
        sessionId: 'session-abc',
        disposition: 'save',
        sessionSnapshot: {
          id: 'session-abc',
          date: '2026-05-09T18:00:00.000Z',
          totalDurationSeconds: 75,
          status: 'completed',
          steps: [
            { id: 'step-1', durationSeconds: 30, status: 'completed' },
            { id: 'step-2', durationSeconds: 45, status: 'completed' },
          ],
        },
        timelineEvents: [
          {
            sequence: 0,
            type: 'session_started',
            occurredAt: '2026-05-09T18:00:00.000Z',
            sessionElapsedSeconds: 0,
            sessionRunning: true,
            currentStepIndex: 0,
            stepId: 'step-1',
            stepStatus: 'pending',
            stepRunning: false,
            stepElapsedSeconds: 0,
            stepDurationSeconds: 30,
          },
        ],
      }));

      return new Response(JSON.stringify({
        ...UNSUPPORTED_SESSION_RECORDING_CAPABILITY,
        supported: true,
        canStart: true,
        canStop: true,
        active: false,
        sessionId: 'session-abc',
        provider: 'command',
        recording: {
          status: 'completed',
          sessionId: 'session-abc',
          provider: 'command',
          relativeFilePath: '2026/05/09/session-abc.mp4',
          downloadPath: '/separation/api/recordings/file/2026/05/09/session-abc.mp4',
          metadataRelativeFilePath: '2026/05/09/session-abc.brave-paws.json',
          metadataDownloadPath: '/separation/api/recordings/file/2026/05/09/session-abc.brave-paws.json',
          chapterCount: 2,
          chaptersEmbedded: true,
        },
        detail: null,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch,
    'https://brave-paws.example/separation/api/',
  );

  assert.equal(capability.active, false);
  assert.equal(capability.recording?.status, 'completed');
  assert.equal(capability.recording?.downloadPath, '/separation/api/recordings/file/2026/05/09/session-abc.mp4');
  assert.equal(capability.recording?.metadataDownloadPath, '/separation/api/recordings/file/2026/05/09/session-abc.brave-paws.json');
  assert.equal(capability.recording?.chapterCount, 2);
  assert.equal(capability.recording?.chaptersEmbedded, true);
});
