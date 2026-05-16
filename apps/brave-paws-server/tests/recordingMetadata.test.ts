import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildRecordingMetadataSidecar,
  deriveRecordingChapters,
  finalizeRecordingMetadata,
  normalizeTimelineEvents,
} from '../src/recordingMetadata.ts';
import type { BravePawsServerConfig } from '../src/config.ts';
import type { Session, SessionRecording, SessionTimelineEvent } from '../src/types.ts';

test('deriveRecordingChapters uses actual runtime event timing instead of naive planned duration sums', () => {
  const timelineEvents: SessionTimelineEvent[] = normalizeTimelineEvents([
    {
      sequence: 0,
      type: 'session_started',
      occurredAt: '2026-05-10T09:00:00.000Z',
      sessionElapsedSeconds: 0,
      sessionRunning: true,
      currentStepIndex: 0,
      stepId: 'step-1',
      stepStatus: 'pending',
      stepRunning: false,
      stepElapsedSeconds: 0,
      stepDurationSeconds: 30,
    },
    {
      sequence: 1,
      type: 'step_started',
      occurredAt: '2026-05-10T09:00:00.000Z',
      sessionElapsedSeconds: 0,
      sessionRunning: true,
      currentStepIndex: 0,
      stepId: 'step-1',
      stepStatus: 'pending',
      stepRunning: true,
      stepElapsedSeconds: 0,
      stepDurationSeconds: 30,
    },
    {
      sequence: 2,
      type: 'step_completed',
      occurredAt: '2026-05-10T09:00:30.000Z',
      sessionElapsedSeconds: 30,
      sessionRunning: true,
      currentStepIndex: 0,
      stepId: 'step-1',
      stepStatus: 'completed',
      stepRunning: false,
      stepElapsedSeconds: 30,
      stepDurationSeconds: 30,
    },
    {
      sequence: 3,
      type: 'step_started',
      occurredAt: '2026-05-10T09:00:45.000Z',
      sessionElapsedSeconds: 45,
      sessionRunning: true,
      currentStepIndex: 1,
      stepId: 'step-2',
      stepStatus: 'pending',
      stepRunning: true,
      stepElapsedSeconds: 0,
      stepDurationSeconds: 20,
    },
    {
      sequence: 4,
      type: 'session_finished',
      occurredAt: '2026-05-10T09:01:00.000Z',
      sessionElapsedSeconds: 60,
      sessionRunning: false,
      currentStepIndex: 1,
      stepId: 'step-2',
      stepStatus: 'completed',
      stepRunning: false,
      stepElapsedSeconds: 15,
      stepDurationSeconds: 20,
    },
  ]);

  const chapters = deriveRecordingChapters({
    timelineEvents,
    recordingStartedAt: '2026-05-10T09:00:00.000Z',
    recordingStoppedAt: '2026-05-10T09:01:00.000Z',
  });

  assert.deepEqual(chapters.map((chapter) => ({ title: chapter.title, startSeconds: chapter.startSeconds, endSeconds: chapter.endSeconds })), [
    { title: 'Step 1 · 30s', startSeconds: 0, endSeconds: 30 },
    { title: 'Step 1 · 30s completed', startSeconds: 30, endSeconds: 45 },
    { title: 'Step 2 · 20s', startSeconds: 45, endSeconds: 60 },
  ]);
});

test('deriveRecordingChapters falls back to session snapshot actual durations when they are available', () => {
  const sessionSnapshot: Session = {
    id: 'session-actuals',
    date: '2026-05-10T09:00:00.000Z',
    totalDurationSeconds: 75,
    status: 'completed',
    steps: [
      { id: 'step-1', durationSeconds: 30, actualDurationSeconds: 42, status: 'completed' },
      { id: 'step-2', durationSeconds: 20, actualDurationSeconds: 18, status: 'aborted' },
    ],
  };

  const chapters = deriveRecordingChapters({
    sessionSnapshot,
    timelineEvents: normalizeTimelineEvents([
      {
        sequence: 0,
        type: 'step_started',
        occurredAt: '2026-05-10T09:00:00.000Z',
        sessionElapsedSeconds: 0,
        sessionRunning: true,
        currentStepIndex: 0,
        stepId: 'step-1',
        stepStatus: 'pending',
        stepRunning: true,
        stepElapsedSeconds: 0,
        stepDurationSeconds: 30,
      },
    ]),
    recordingStartedAt: '2026-05-10T09:00:00.000Z',
    recordingStoppedAt: '2026-05-10T09:01:15.000Z',
  });

  assert.deepEqual(chapters.map((chapter) => ({ title: chapter.title, startSeconds: chapter.startSeconds, endSeconds: chapter.endSeconds })), [
    { title: 'Step 1 · 42s completed', startSeconds: 0, endSeconds: 42 },
    { title: 'Step 2 · 18s aborted', startSeconds: 42, endSeconds: 60 },
  ]);
});

test('deriveRecordingChapters clamps snapshot-derived chapters to the captured recording length', () => {
  const sessionSnapshot: Session = {
    id: 'session-clamped',
    date: '2026-05-10T09:00:00.000Z',
    totalDurationSeconds: 75,
    status: 'completed',
    steps: [
      { id: 'step-1', durationSeconds: 30, actualDurationSeconds: 42, status: 'completed' },
      { id: 'step-2', durationSeconds: 20, actualDurationSeconds: 18, status: 'completed' },
    ],
  };

  const chapters = deriveRecordingChapters({
    sessionSnapshot,
    timelineEvents: [],
    recordingStartedAt: '2026-05-10T09:00:00.000Z',
    recordingStoppedAt: '2026-05-10T09:00:50.000Z',
  });

  assert.deepEqual(chapters.map((chapter) => ({ title: chapter.title, startSeconds: chapter.startSeconds, endSeconds: chapter.endSeconds })), [
    { title: 'Step 1 · 42s completed', startSeconds: 0, endSeconds: 42 },
    { title: 'Step 2 · 18s completed', startSeconds: 42, endSeconds: 50 },
  ]);
});

test('finalizeRecordingMetadata ignores unsafe recording relative paths', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-recording-metadata-'));

  try {
    const config: BravePawsServerConfig = {
      host: '127.0.0.1',
      port: 0,
      publicBaseUrl: null,
      landingBasePath: '/separation/',
      appBasePath: '/separation/app/',
      apiBasePath: '/separation/api/',
      cameraBasePath: '/separation/camera/',
      healthPath: '/separation/api/health',
      clientDiagnosticsPath: '/separation/api/client-diagnostics',
      landingDistDir: path.join(tempDir, 'landing'),
      appDistDir: path.join(tempDir, 'app'),
      dataDir: tempDir,
      dataFilePath: path.join(tempDir, 'sessions.json'),
      pairingStoreFilePath: path.join(tempDir, 'pairings.json'),
      pairingEnabled: false,
      cameraUpstreamBaseUrl: 'http://127.0.0.1:9999/',
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
      recordingsDir: path.join(tempDir, 'recordings'),
    };

    const recording: SessionRecording = {
      status: 'completed',
      sessionId: 'session-unsafe',
      provider: 'command',
      startedAt: '2026-05-10T09:00:00.000Z',
      stoppedAt: '2026-05-10T09:00:05.000Z',
      relativeFilePath: '../escape.mp4',
      durationSeconds: 5,
      hasAudio: false,
    };

    const finalized = await finalizeRecordingMetadata({
      config,
      recording,
    });

    assert.deepEqual(finalized, recording);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('buildRecordingMetadataSidecar emits the canonical v1 sidecar structure', () => {
  const sessionSnapshot: Session = {
    id: 'session-123',
    date: '2026-05-10T09:00:00.000Z',
    totalDurationSeconds: 60,
    status: 'completed',
    steps: [
      { id: 'step-1', durationSeconds: 30, actualDurationSeconds: 32, status: 'completed' },
      { id: 'step-2', durationSeconds: 20, actualDurationSeconds: 18, status: 'completed' },
    ],
  };
  const recording: SessionRecording = {
    status: 'completed',
    sessionId: 'session-123',
    provider: 'command',
    startedAt: '2026-05-10T09:00:00.000Z',
    stoppedAt: '2026-05-10T09:01:00.000Z',
    relativeFilePath: '2026/05/10/session-123.mp4',
    metadataRelativeFilePath: '2026/05/10/session-123.brave-paws.json',
    durationSeconds: 60,
    sizeBytes: 1024,
    chapterCount: 3,
    chaptersEmbedded: true,
    hasAudio: true,
  };
  const timelineEvents = normalizeTimelineEvents([
    {
      sequence: 0,
      type: 'step_started',
      occurredAt: '2026-05-10T09:00:00.000Z',
      sessionElapsedSeconds: 0,
      sessionRunning: true,
      currentStepIndex: 0,
      stepId: 'step-1',
      stepStatus: 'pending',
      stepRunning: true,
      stepElapsedSeconds: 0,
      stepDurationSeconds: 30,
    },
  ]);
  const chapters = deriveRecordingChapters({
    timelineEvents,
    recordingStartedAt: '2026-05-10T09:00:00.000Z',
    recordingStoppedAt: '2026-05-10T09:01:00.000Z',
  });

  const sidecar = buildRecordingMetadataSidecar({
    sessionSnapshot,
    recording,
    timelineEvents,
    chapters,
    metadataRelativePath: '2026/05/10/session-123.brave-paws.json',
    chaptersEmbedded: true,
  });

  assert.equal(sidecar.schema, 'brave-paws-recording-metadata');
  assert.equal(sidecar.version, 1);
  assert.equal(sidecar.recordingFile.relativePath, '2026/05/10/session-123.mp4');
  assert.equal(sidecar.recordingFile.metadataRelativePath, '2026/05/10/session-123.brave-paws.json');
  assert.equal(sidecar.session.stepCount, 2);
  assert.equal(sidecar.session.steps[0]?.actualDurationSeconds, 32);
  assert.equal(sidecar.recording.chapterCount, chapters.length);
  assert.equal(sidecar.recording.chaptersEmbedded, true);
  assert.equal(sidecar.timeline.eventCount, 1);
});
