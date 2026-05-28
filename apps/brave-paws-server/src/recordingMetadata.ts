import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { BravePawsServerConfig } from './config.js';
import type { Session, SessionRecording, SessionTimelineEvent, SessionTimelineEventType, StepStatus } from './types.js';

const execFileAsync = promisify(execFile);

const TIMELINE_EVENT_TYPES = new Set<SessionTimelineEventType>([
  'session_started',
  'session_paused',
  'session_resumed',
  'session_finished',
  'session_cancelled',
  'step_started',
  'step_paused',
  'step_resumed',
  'step_completed',
  'step_aborted',
]);

const STEP_STATUSES = new Set<StepStatus>(['pending', 'completed', 'aborted']);

export type RecordingMetadataChapter = {
  index: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  startTimeMs: number;
  endTimeMs: number;
  sourceEventSequence: number | null;
};

export type BravePawsRecordingMetadataV1 = {
  schema: 'brave-paws-recording-metadata';
  version: 1;
  generatedAt: string;
  recordingFile: {
    relativePath: string;
    metadataRelativePath: string;
  };
  session: {
    id: string | null;
    date: string | null;
    status: string | null;
    totalDurationSeconds: number | null;
    stepCount: number;
    steps: Array<{
      index: number;
      plannedDurationSeconds: number;
      actualDurationSeconds: number | null;
      status: string;
    }>;
  };
  recording: {
    status: string;
    provider: string;
    sessionId: string | null;
    startedAt: string | null;
    stoppedAt: string | null;
    durationSeconds: number | null;
    hasAudio: boolean;
    sizeBytes: number | null;
    chapterCount: number;
    chaptersEmbedded: boolean;
  };
  timeline: {
    eventCount: number;
    events: SessionTimelineEvent[];
  };
  chapters: RecordingMetadataChapter[];
};

function normalizeNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function formatRecordingFilenameTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day} ${hour}-${minute}-${second}`;
}

function formatRecordingFilenameDuration(durationSeconds: number | null): string | null {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return null;
  }

  const totalSeconds = Math.round(durationSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }

  if (seconds > 0 || (!hours && !minutes)) {
    parts.push(`${seconds}s`);
  }

  return parts.join('');
}

function getPlannedSessionDurationSeconds(sessionSnapshot: Session | null | undefined): number | null {
  if (!sessionSnapshot?.steps.length) {
    return null;
  }

  const total = sessionSnapshot.steps.reduce((sum, step) => sum + Math.max(0, step.durationSeconds), 0);
  return Number.isFinite(total) ? total : null;
}

function sanitizeRecordingFilenameComponent(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, targetPath);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : null;
    if (code !== 'EXDEV') {
      throw error;
    }

    await fs.copyFile(sourcePath, targetPath);
    await fs.unlink(sourcePath);
  }
}

async function buildPreferredRelativeRecordingPath(options: {
  config: BravePawsServerConfig;
  recording: SessionRecording;
  currentRelativePath: string;
  sessionSnapshot?: Session | null;
}): Promise<string | null> {
  const timestampLabel = formatRecordingFilenameTimestamp(options.recording.startedAt ?? options.recording.stoppedAt ?? null);
  if (!timestampLabel) {
    return null;
  }

  const extension = path.posix.extname(options.currentRelativePath) || '.mp4';
  const dirname = path.posix.dirname(options.currentRelativePath);
  const durationLabel = formatRecordingFilenameDuration(getPlannedSessionDurationSeconds(options.sessionSnapshot));
  const preferredBasename = sanitizeRecordingFilenameComponent(
    durationLabel ? `${timestampLabel} - max ${durationLabel}` : timestampLabel,
  );
  const baseRelativePath = dirname === '.'
    ? `${preferredBasename}${extension}`
    : path.posix.join(dirname, `${preferredBasename}${extension}`);

  if (baseRelativePath === options.currentRelativePath) {
    return baseRelativePath;
  }

  const baseResolvedPath = path.join(options.config.recordingsDir, ...baseRelativePath.split('/'));
  if (!await pathExists(baseResolvedPath)) {
    return baseRelativePath;
  }

  const sessionSuffix = options.recording.sessionId?.slice(0, 8) ?? 'recording';
  return dirname === '.'
    ? `${preferredBasename} - ${sessionSuffix}${extension}`
    : path.posix.join(dirname, `${preferredBasename} - ${sessionSuffix}${extension}`);
}

function normalizeStepStatus(value: unknown): StepStatus | null {
  return STEP_STATUSES.has(value as StepStatus) ? (value as StepStatus) : null;
}

function normalizeTimelineEvent(value: unknown): SessionTimelineEvent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const type = TIMELINE_EVENT_TYPES.has(candidate.type as SessionTimelineEventType)
    ? (candidate.type as SessionTimelineEventType)
    : null;
  const occurredAt = normalizeTimestamp(candidate.occurredAt);
  const sequence = typeof candidate.sequence === 'number' && Number.isFinite(candidate.sequence)
    ? Math.max(0, Math.trunc(candidate.sequence))
    : null;
  const sessionElapsedSeconds = normalizeNonNegativeNumber(candidate.sessionElapsedSeconds);

  if (!type || occurredAt == null || sequence == null || sessionElapsedSeconds == null) {
    return null;
  }

  return {
    sequence,
    type,
    occurredAt,
    sessionElapsedSeconds,
    sessionRunning: typeof candidate.sessionRunning === 'boolean' ? candidate.sessionRunning : false,
    currentStepIndex: typeof candidate.currentStepIndex === 'number' && Number.isFinite(candidate.currentStepIndex)
      ? Math.max(0, Math.trunc(candidate.currentStepIndex))
      : null,
    stepId: typeof candidate.stepId === 'string' && candidate.stepId.trim() ? candidate.stepId : null,
    stepStatus: normalizeStepStatus(candidate.stepStatus),
    stepRunning: typeof candidate.stepRunning === 'boolean' ? candidate.stepRunning : false,
    stepElapsedSeconds: normalizeNonNegativeNumber(candidate.stepElapsedSeconds),
    stepDurationSeconds: normalizeNonNegativeNumber(candidate.stepDurationSeconds),
  };
}

export function normalizeTimelineEvents(value: unknown): SessionTimelineEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((event) => normalizeTimelineEvent(event))
    .filter((event): event is SessionTimelineEvent => event !== null)
    .sort((left, right) => {
      const timestampDelta = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
      if (timestampDelta !== 0) {
        return timestampDelta;
      }

      return left.sequence - right.sequence;
    });
}

function formatChapterDuration(durationSeconds: number | null): string | null {
  if (durationSeconds == null) {
    return null;
  }

  if (durationSeconds < 60) {
    return `${durationSeconds}s`;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function getRecordedStepDurationSeconds(step: Session['steps'][number]): number {
  return step.actualDurationSeconds ?? step.durationSeconds;
}

function describeSessionSnapshotStep(index: number, sessionSnapshot: Session): string | null {
  const step = sessionSnapshot.steps[index];
  if (!step) {
    return null;
  }

  const actualDuration = formatChapterDuration(getRecordedStepDurationSeconds(step));
  const stepLabel = `Step ${index + 1}${actualDuration ? ` · ${actualDuration}` : ''}`;

  if (step.status === 'completed') {
    return `${stepLabel} completed`;
  }

  if (step.status === 'aborted') {
    return `${stepLabel} aborted`;
  }

  return stepLabel;
}

function describeTimelineState(event: SessionTimelineEvent): string {
  const stepNumber = event.currentStepIndex != null ? event.currentStepIndex + 1 : null;
  const plannedDuration = formatChapterDuration(event.stepDurationSeconds);
  const stepLabel = stepNumber != null
    ? `Step ${stepNumber}${plannedDuration ? ` · ${plannedDuration}` : ''}`
    : 'Session';

  switch (event.type) {
    case 'step_started':
    case 'step_resumed':
      return `${stepLabel}`;
    case 'step_paused':
      return `${stepLabel} paused`;
    case 'step_completed':
      return `${stepLabel} completed`;
    case 'step_aborted':
      return `${stepLabel} aborted`;
    case 'session_paused':
      return stepNumber != null ? `${stepLabel} · session paused` : 'Session paused';
    case 'session_resumed':
    case 'session_started':
      return event.stepRunning && stepNumber != null ? stepLabel : 'Session running';
    case 'session_finished':
      return 'Session finished';
    case 'session_cancelled':
      return 'Session cancelled';
    default:
      return 'Session';
  }
}

function clampMilliseconds(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue);
}

function getRecordingTimelineLengthMs(options: {
  recordingStartedAt?: string | null;
  recordingStoppedAt?: string | null;
  recordingDurationSeconds?: number | null;
}): number | null {
  const recordingStartedAtMs = options.recordingStartedAt ? Date.parse(options.recordingStartedAt) : Number.NaN;
  const recordingStoppedAtMs = options.recordingStoppedAt ? Date.parse(options.recordingStoppedAt) : Number.NaN;

  if (Number.isFinite(recordingStartedAtMs) && Number.isFinite(recordingStoppedAtMs)) {
    return Math.max(0, recordingStoppedAtMs - recordingStartedAtMs);
  }

  if (options.recordingDurationSeconds != null) {
    return Math.max(0, Math.round(options.recordingDurationSeconds * 1000));
  }

  return null;
}

function resolveSafeRelativeRecordingPath(config: BravePawsServerConfig, relativeRecordingPath: string): {
  safeRelativePath: string;
  resolvedRecordingPath: string;
  metadataRelativePath: string;
  metadataFilePath: string;
} | null {
  const segments = relativeRecordingPath
    .split('/')
    .filter(Boolean);

  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..' || segment.includes('..') || segment.includes('\\'))) {
    return null;
  }

  const resolvedRecordingPath = path.resolve(config.recordingsDir, ...segments);
  const relativeResolved = path.relative(config.recordingsDir, resolvedRecordingPath);
  if (relativeResolved.startsWith('..') || path.isAbsolute(relativeResolved)) {
    return null;
  }

  const safeRelativePath = relativeResolved.split(path.sep).join('/');
  const metadataRelativePath = buildMetadataRelativePath(safeRelativePath);
  const metadataFilePath = path.resolve(config.recordingsDir, ...metadataRelativePath.split('/'));
  const metadataRelativeResolved = path.relative(config.recordingsDir, metadataFilePath);
  if (metadataRelativeResolved.startsWith('..') || path.isAbsolute(metadataRelativeResolved)) {
    return null;
  }

  return {
    safeRelativePath,
    resolvedRecordingPath,
    metadataRelativePath,
    metadataFilePath,
  };
}

export function deriveRecordingChapters(options: {
  sessionSnapshot?: Session | null;
  timelineEvents: SessionTimelineEvent[];
  recordingStartedAt?: string | null;
  recordingStoppedAt?: string | null;
  recordingDurationSeconds?: number | null;
}): RecordingMetadataChapter[] {
  const timelineEvents = normalizeTimelineEvents(options.timelineEvents);
  const sessionSnapshot = options.sessionSnapshot ?? null;

  if (sessionSnapshot?.steps.length) {
    const snapshotChapters: RecordingMetadataChapter[] = [];
    const recordingTimelineLengthMs = getRecordingTimelineLengthMs(options);
    let cursorMs = 0;

    for (let index = 0; index < sessionSnapshot.steps.length; index += 1) {
      const step = sessionSnapshot.steps[index]!;
      const durationSeconds = getRecordedStepDurationSeconds(step);
      const durationMs = Math.max(0, Math.round(durationSeconds * 1000));
      const title = describeSessionSnapshotStep(index, sessionSnapshot);
      if (!title || durationMs <= 0) {
        continue;
      }

      const startTimeMs = recordingTimelineLengthMs != null
        ? clampMilliseconds(cursorMs, 0, recordingTimelineLengthMs)
        : cursorMs;
      const endTimeMs = recordingTimelineLengthMs != null
        ? clampMilliseconds(cursorMs + durationMs, startTimeMs, recordingTimelineLengthMs)
        : cursorMs + durationMs;
      if (endTimeMs <= startTimeMs) {
        break;
      }

      snapshotChapters.push({
        index: snapshotChapters.length + 1,
        title,
        startTimeMs,
        endTimeMs,
        startSeconds: Number((startTimeMs / 1000).toFixed(3)),
        endSeconds: Number((endTimeMs / 1000).toFixed(3)),
        sourceEventSequence: null,
      });
      cursorMs = endTimeMs;
    }

    if (snapshotChapters.length > 0 && sessionSnapshot.steps.some((step) => step.actualDurationSeconds != null)) {
      return snapshotChapters;
    }

    if (!timelineEvents.length && snapshotChapters.length > 0) {
      return snapshotChapters;
    }
  }

  if (!timelineEvents.length) {
    return [];
  }

  const firstEventMs = Date.parse(timelineEvents[0]!.occurredAt);
  const recordingStartedAtMs = options.recordingStartedAt ? Date.parse(options.recordingStartedAt) : Number.NaN;
  const timelineStartMs = Number.isFinite(recordingStartedAtMs) ? recordingStartedAtMs : firstEventMs;

  const stoppedAtMs = options.recordingStoppedAt ? Date.parse(options.recordingStoppedAt) : Number.NaN;
  const durationMs = options.recordingDurationSeconds != null ? Math.round(options.recordingDurationSeconds * 1000) : null;
  const rawEndMs = Number.isFinite(stoppedAtMs)
    ? stoppedAtMs
    : durationMs != null
    ? timelineStartMs + durationMs
    : Date.parse(timelineEvents[timelineEvents.length - 1]!.occurredAt);
  const recordingEndMs = Math.max(rawEndMs, timelineStartMs);

  const chapters: RecordingMetadataChapter[] = [];
  const appendChapter = (title: string, startTimeMs: number, endTimeMs: number, sourceEventSequence: number | null) => {
    if (endTimeMs <= startTimeMs) {
      return;
    }

    const previous = chapters[chapters.length - 1];
    if (previous && previous.title === title && previous.endTimeMs === startTimeMs) {
      previous.endTimeMs = endTimeMs;
      previous.endSeconds = Number((endTimeMs / 1000).toFixed(3));
      return;
    }

    chapters.push({
      index: chapters.length + 1,
      title,
      startTimeMs,
      endTimeMs,
      startSeconds: Number((startTimeMs / 1000).toFixed(3)),
      endSeconds: Number((endTimeMs / 1000).toFixed(3)),
      sourceEventSequence,
    });
  };

  const firstEventOffsetMs = clampMilliseconds(firstEventMs - timelineStartMs, 0, Math.max(recordingEndMs - timelineStartMs, 0));
  if (firstEventOffsetMs > 0) {
    appendChapter('Recording pre-roll', 0, firstEventOffsetMs, null);
  }

  for (let index = 0; index < timelineEvents.length; index += 1) {
    const event = timelineEvents[index]!;
    const nextEvent = timelineEvents[index + 1] ?? null;
    const startTimeMs = clampMilliseconds(Date.parse(event.occurredAt) - timelineStartMs, 0, Math.max(recordingEndMs - timelineStartMs, 0));
    const endTimeMs = nextEvent
      ? clampMilliseconds(Date.parse(nextEvent.occurredAt) - timelineStartMs, startTimeMs, Math.max(recordingEndMs - timelineStartMs, 0))
      : Math.max(recordingEndMs - timelineStartMs, startTimeMs);
    appendChapter(describeTimelineState(event), startTimeMs, endTimeMs, event.sequence);
  }

  return chapters;
}

function buildMetadataRelativePath(relativeRecordingPath: string): string {
  const dirname = path.posix.dirname(relativeRecordingPath);
  const extension = path.posix.extname(relativeRecordingPath);
  const basename = path.posix.basename(relativeRecordingPath, extension);
  const metadataBasename = `${basename}.brave-paws.json`;
  return dirname === '.' ? metadataBasename : path.posix.join(dirname, metadataBasename);
}

function buildMetadataFilePath(config: BravePawsServerConfig, relativeRecordingPath: string): string {
  return path.join(config.recordingsDir, ...buildMetadataRelativePath(relativeRecordingPath).split('/'));
}

async function readExistingMetadataTimelineEvents(
  config: BravePawsServerConfig,
  relativeRecordingPath: string,
): Promise<SessionTimelineEvent[]> {
  const metadataFilePath = buildMetadataFilePath(config, relativeRecordingPath);

  try {
    const raw = await fs.readFile(metadataFilePath, 'utf8');
    const parsed = JSON.parse(raw) as { timeline?: { events?: unknown } };
    return normalizeTimelineEvents(parsed.timeline?.events);
  } catch {
    return [];
  }
}

async function readFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? stats.size : null;
  } catch {
    return null;
  }
}

async function probeMediaDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) ? Number(duration.toFixed(3)) : null;
  } catch {
    return null;
  }
}

function escapeFfmetadataValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll('#', '\\#').replaceAll('=', '\\=').replaceAll('\n', '\\n');
}

function renderFfmetadata(chapters: RecordingMetadataChapter[]): string {
  const lines = [';FFMETADATA1'];

  for (const chapter of chapters) {
    lines.push('[CHAPTER]');
    lines.push('TIMEBASE=1/1000');
    lines.push(`START=${chapter.startTimeMs}`);
    lines.push(`END=${chapter.endTimeMs}`);
    lines.push(`title=${escapeFfmetadataValue(chapter.title)}`);
  }

  lines.push('');
  return lines.join('\n');
}

async function embedChaptersIntoMp4(mp4Path: string, chapters: RecordingMetadataChapter[]): Promise<boolean> {
  if (!chapters.length) {
    return false;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brave-paws-mp4-chapters-'));
  const ffmetadataPath = path.join(tempDir, 'chapters.ffmetadata');
  const outputPath = path.join(
    path.dirname(mp4Path),
    `.${path.basename(mp4Path, path.extname(mp4Path))}.chapters-${process.pid}-${Date.now()}${path.extname(mp4Path)}`,
  );

  try {
    await fs.writeFile(ffmetadataPath, renderFfmetadata(chapters), 'utf8');
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', mp4Path,
      '-i', ffmetadataPath,
      '-map', '0',
      '-map_metadata', '1',
      '-codec', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 4,
    });
    await fs.rename(outputPath, mp4Path);
    return true;
  } finally {
    await fs.rm(outputPath, { force: true });
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function buildRecordingMetadataSidecar(options: {
  sessionSnapshot?: Session | null;
  recording: SessionRecording;
  timelineEvents: SessionTimelineEvent[];
  chapters: RecordingMetadataChapter[];
  metadataRelativePath: string;
  chaptersEmbedded: boolean;
}): BravePawsRecordingMetadataV1 {
  const sessionSnapshot = options.sessionSnapshot ?? null;

  return {
    schema: 'brave-paws-recording-metadata',
    version: 1,
    generatedAt: new Date().toISOString(),
    recordingFile: {
      relativePath: options.recording.relativeFilePath ?? '',
      metadataRelativePath: options.metadataRelativePath,
    },
    session: {
      id: sessionSnapshot?.id ?? options.recording.sessionId ?? null,
      date: sessionSnapshot?.date ?? null,
      status: sessionSnapshot?.status ?? null,
      totalDurationSeconds: sessionSnapshot?.totalDurationSeconds ?? null,
      stepCount: sessionSnapshot?.steps.length ?? 0,
      steps: (sessionSnapshot?.steps ?? []).map((step, index) => ({
        index,
        plannedDurationSeconds: step.durationSeconds,
        actualDurationSeconds: step.actualDurationSeconds ?? null,
        status: step.status,
      })),
    },
    recording: {
      status: options.recording.status,
      provider: options.recording.provider,
      sessionId: options.recording.sessionId,
      startedAt: options.recording.startedAt ?? null,
      stoppedAt: options.recording.stoppedAt ?? null,
      durationSeconds: options.recording.durationSeconds ?? null,
      hasAudio: Boolean(options.recording.hasAudio),
      sizeBytes: options.recording.sizeBytes ?? null,
      chapterCount: options.chapters.length,
      chaptersEmbedded: options.chaptersEmbedded,
    },
    timeline: {
      eventCount: options.timelineEvents.length,
      events: options.timelineEvents,
    },
    chapters: options.chapters,
  };
}

export async function finalizeRecordingMetadata(options: {
  config: BravePawsServerConfig;
  recording: SessionRecording;
  sessionSnapshot?: Session | null;
  timelineEvents?: SessionTimelineEvent[];
}): Promise<SessionRecording> {
  const { recording } = options;
  if (recording.status !== 'completed' || !recording.relativeFilePath) {
    return recording;
  }

  let workingRecording = recording;
  let resolvedPaths = resolveSafeRelativeRecordingPath(options.config, workingRecording.relativeFilePath!);
  if (!resolvedPaths) {
    return recording;
  }

  const preferredRelativePath = await buildPreferredRelativeRecordingPath({
    config: options.config,
    recording: workingRecording,
    currentRelativePath: resolvedPaths.safeRelativePath,
    sessionSnapshot: options.sessionSnapshot,
  });

  if (preferredRelativePath && preferredRelativePath !== resolvedPaths.safeRelativePath) {
    const preferredResolvedPaths = resolveSafeRelativeRecordingPath(options.config, preferredRelativePath);
    if (preferredResolvedPaths) {
      await fs.mkdir(path.dirname(preferredResolvedPaths.resolvedRecordingPath), { recursive: true });
      await moveFile(resolvedPaths.resolvedRecordingPath, preferredResolvedPaths.resolvedRecordingPath);
      if (preferredResolvedPaths.metadataFilePath !== resolvedPaths.metadataFilePath) {
        await fs.rm(resolvedPaths.metadataFilePath, { force: true });
      }
      workingRecording = {
        ...workingRecording,
        relativeFilePath: preferredResolvedPaths.safeRelativePath,
      };
      resolvedPaths = preferredResolvedPaths;
    }
  }

  const { resolvedRecordingPath, metadataRelativePath, metadataFilePath, safeRelativePath } = resolvedPaths;
  const providedTimelineEvents = normalizeTimelineEvents(options.timelineEvents);
  const normalizedTimelineEvents = providedTimelineEvents.length > 0
    ? providedTimelineEvents
    : await readExistingMetadataTimelineEvents(options.config, safeRelativePath);
  const measuredSizeBytes = recording.sizeBytes ?? await readFileSize(resolvedRecordingPath);
  const measuredDurationSeconds = recording.durationSeconds ?? await probeMediaDurationSeconds(resolvedRecordingPath);
  const nextRecording: SessionRecording = {
    ...workingRecording,
    sizeBytes: measuredSizeBytes,
    durationSeconds: measuredDurationSeconds,
    metadataRelativeFilePath: metadataRelativePath,
  };

  const chapters = deriveRecordingChapters({
    sessionSnapshot: options.sessionSnapshot,
    timelineEvents: normalizedTimelineEvents,
    recordingStartedAt: nextRecording.startedAt,
    recordingStoppedAt: nextRecording.stoppedAt,
    recordingDurationSeconds: nextRecording.durationSeconds,
  });

  let chaptersEmbedded = false;
  if (nextRecording.durationSeconds != null && path.extname(resolvedRecordingPath).toLowerCase() === '.mp4') {
    try {
      chaptersEmbedded = await embedChaptersIntoMp4(resolvedRecordingPath, chapters);
    } catch (error) {
      console.warn('Unable to embed Brave Paws MP4 chapters.', error);
    }
  }

  const sidecar = buildRecordingMetadataSidecar({
    sessionSnapshot: options.sessionSnapshot,
    recording: {
      ...nextRecording,
      chapterCount: chapters.length,
      chaptersEmbedded,
    },
    timelineEvents: normalizedTimelineEvents,
    chapters,
    metadataRelativePath,
    chaptersEmbedded,
  });

  await fs.mkdir(path.dirname(metadataFilePath), { recursive: true });
  await fs.writeFile(metadataFilePath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');

  return {
    ...nextRecording,
    chapterCount: chapters.length,
    chaptersEmbedded,
  };
}
