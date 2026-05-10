import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { BravePawsServerConfig } from './config.js';
import { finalizeRecordingMetadata } from './recordingMetadata.js';
import type { Session, SessionRecording, SessionTimelineEvent } from './types.js';

const execFileAsync = promisify(execFile);

type RecordingCommandKind = 'status' | 'start' | 'stop';

type RecordingCommandPayload = {
  sessionId?: string;
  sessionDate?: string;
  sessionStatus?: string;
  disposition?: 'save' | 'discard';
  sessionSnapshot?: Session;
  timelineEvents?: SessionTimelineEvent[];
};

export type SessionRecordingCapability = {
  key: 'sessionRecording';
  label: string;
  provider: string;
  supported: boolean;
  canStart: boolean;
  canStop: boolean;
  active: boolean;
  sessionId: string | null;
  detail: string | null;
  recording: SessionRecording | null;
};

export interface SessionRecordingController {
  getCapability(): Promise<SessionRecordingCapability>;
  startRecording(payload: RecordingCommandPayload): Promise<SessionRecordingCapability>;
  stopRecording(payload: RecordingCommandPayload): Promise<SessionRecordingCapability>;
}

class RecordingCommandError extends Error {
  constructor(
    message: string,
    readonly safeDetail: string,
  ) {
    super(message);
    this.name = 'RecordingCommandError';
  }
}

function toShellString(command: string | null | undefined): string | null {
  const trimmed = command?.trim();
  return trimmed ? trimmed : null;
}

function getCommandFailureDetail(kind: RecordingCommandKind): string {
  if (kind === 'status') {
    return 'Session recording status unavailable.';
  }

  return kind === 'start'
    ? 'Unable to start session recording right now.'
    : 'Unable to stop session recording right now.';
}

function getSafeCommandErrorDetail(error: unknown, fallback: string): string {
  if (error instanceof RecordingCommandError) {
    return error.safeDetail;
  }

  return fallback;
}

async function runShellCommand(command: string, kind: RecordingCommandKind, envOverrides: Record<string, string>) {
  try {
    return await execFileAsync('/bin/sh', ['-c', command], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        ...envOverrides,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    throw new RecordingCommandError(message, getCommandFailureDetail(kind));
  }
}

function normalizeRecording(value: unknown, provider: string, fallbackSessionId: string | null): SessionRecording | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const status =
    candidate.status === 'idle' ||
    candidate.status === 'recording' ||
    candidate.status === 'completed' ||
    candidate.status === 'discarded' ||
    candidate.status === 'failed'
      ? candidate.status
      : null;

  if (!status) {
    return null;
  }

  return {
    status,
    sessionId: typeof candidate.sessionId === 'string' ? candidate.sessionId : fallbackSessionId,
    provider,
    startedAt: typeof candidate.startedAt === 'string' ? candidate.startedAt : null,
    stoppedAt: typeof candidate.stoppedAt === 'string' ? candidate.stoppedAt : null,
    hasAudio: typeof candidate.hasAudio === 'boolean' ? candidate.hasAudio : false,
    relativeFilePath: typeof candidate.relativeFilePath === 'string' ? candidate.relativeFilePath : null,
    downloadPath: typeof candidate.downloadPath === 'string' ? candidate.downloadPath : null,
    metadataRelativeFilePath: typeof candidate.metadataRelativeFilePath === 'string' ? candidate.metadataRelativeFilePath : null,
    metadataDownloadPath: typeof candidate.metadataDownloadPath === 'string' ? candidate.metadataDownloadPath : null,
    durationSeconds:
      typeof candidate.durationSeconds === 'number' && Number.isFinite(candidate.durationSeconds)
        ? Math.max(0, candidate.durationSeconds)
        : null,
    sizeBytes:
      typeof candidate.sizeBytes === 'number' && Number.isFinite(candidate.sizeBytes)
        ? Math.max(0, candidate.sizeBytes)
        : null,
    chapterCount:
      typeof candidate.chapterCount === 'number' && Number.isFinite(candidate.chapterCount)
        ? Math.max(0, candidate.chapterCount)
        : null,
    chaptersEmbedded: typeof candidate.chaptersEmbedded === 'boolean' ? candidate.chaptersEmbedded : null,
    detail: typeof candidate.detail === 'string' ? candidate.detail : null,
  };
}

function parseJsonCapability(raw: string, label: string, provider: string): SessionRecordingCapability | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const recording = normalizeRecording(parsed.recording ?? parsed, provider, typeof parsed.sessionId === 'string' ? parsed.sessionId : null);
    const active = typeof parsed.active === 'boolean'
      ? parsed.active
      : recording?.status === 'recording';
    const sessionId = typeof parsed.sessionId === 'string'
      ? parsed.sessionId
      : recording?.sessionId ?? null;

    return {
      key: 'sessionRecording',
      label,
      provider,
      supported: typeof parsed.supported === 'boolean' ? parsed.supported : true,
      canStart: typeof parsed.canStart === 'boolean' ? parsed.canStart : true,
      canStop: typeof parsed.canStop === 'boolean' ? parsed.canStop : true,
      active: Boolean(active),
      sessionId,
      detail: typeof parsed.detail === 'string' ? parsed.detail : recording?.detail ?? null,
      recording,
    };
  } catch {
    return null;
  }
}

function parseFallbackCapability(raw: string, label: string, provider: string): SessionRecordingCapability | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['idle', 'off', 'inactive', 'stopped'].includes(normalized)) {
    return {
      key: 'sessionRecording',
      label,
      provider,
      supported: true,
      canStart: true,
      canStop: true,
      active: false,
      sessionId: null,
      detail: null,
      recording: null,
    };
  }

  if (['recording', 'active', 'running', 'on'].includes(normalized)) {
    return {
      key: 'sessionRecording',
      label,
      provider,
      supported: true,
      canStart: true,
      canStop: true,
      active: true,
      sessionId: null,
      detail: null,
      recording: {
        status: 'recording',
        sessionId: null,
        provider,
        detail: null,
      },
    };
  }

  return null;
}

function parseCapabilityOutput(raw: string, label: string, provider: string): SessionRecordingCapability {
  return (
    parseJsonCapability(raw, label, provider)
    ?? parseFallbackCapability(raw, label, provider)
    ?? {
      key: 'sessionRecording',
      label,
      provider,
      supported: true,
      canStart: true,
      canStop: true,
      active: false,
      sessionId: null,
      detail: 'Session recording status is available but could not be parsed.',
      recording: null,
    }
  );
}

function buildCapability(options: {
  label: string;
  provider: string;
  supported: boolean;
  canStart: boolean;
  canStop: boolean;
  active?: boolean;
  sessionId?: string | null;
  detail?: string | null;
  recording?: SessionRecording | null;
}): SessionRecordingCapability {
  return {
    key: 'sessionRecording',
    label: options.label,
    provider: options.provider,
    supported: options.supported,
    canStart: options.canStart,
    canStop: options.canStop,
    active: options.active ?? false,
    sessionId: options.sessionId ?? null,
    detail: options.detail ?? null,
    recording: options.recording ?? null,
  };
}

function buildRecordingEnv(config: BravePawsServerConfig, payload: RecordingCommandPayload = {}): Record<string, string> {
  return {
    BRAVE_PAWS_DATA_DIR: config.dataDir,
    BRAVE_PAWS_RECORDINGS_DIR: config.recordingsDir,
    BRAVE_PAWS_RECORDING_SESSION_ID: payload.sessionId || '',
    BRAVE_PAWS_RECORDING_SESSION_DATE: payload.sessionDate || '',
    BRAVE_PAWS_RECORDING_SESSION_STATUS: payload.sessionStatus || '',
    BRAVE_PAWS_RECORDING_DISPOSITION: payload.disposition || 'save',
  };
}

class UnsupportedSessionRecordingController implements SessionRecordingController {
  constructor(
    private readonly options: {
      label: string;
      provider: string;
      detail: string;
    },
  ) {}

  async getCapability(): Promise<SessionRecordingCapability> {
    return buildCapability({
      label: this.options.label,
      provider: this.options.provider,
      supported: false,
      canStart: false,
      canStop: false,
      detail: this.options.detail,
    });
  }

  async startRecording(): Promise<SessionRecordingCapability> {
    return this.getCapability();
  }

  async stopRecording(): Promise<SessionRecordingCapability> {
    return this.getCapability();
  }
}

class CommandSessionRecordingController implements SessionRecordingController {
  private operationQueue = Promise.resolve();

  constructor(
    private readonly options: {
      config: BravePawsServerConfig;
      label: string;
      provider: string;
      statusCommand: string;
      startCommand: string;
      stopCommand: string;
    },
  ) {}

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readCapability(payload: RecordingCommandPayload = {}, detailOverride: string | null = null): Promise<SessionRecordingCapability> {
    try {
      const result = await runShellCommand(
        this.options.statusCommand,
        'status',
        buildRecordingEnv(this.options.config, payload),
      );
      const capability = parseCapabilityOutput(result.stdout, this.options.label, this.options.provider);
      return {
        ...capability,
        detail: detailOverride ?? capability.detail,
      };
    } catch (error) {
      console.error('Session recording status command failed', error);
      return buildCapability({
        label: this.options.label,
        provider: this.options.provider,
        supported: true,
        canStart: true,
        canStop: true,
        active: false,
        sessionId: payload.sessionId ?? null,
        detail: detailOverride ?? getSafeCommandErrorDetail(error, 'Session recording status unavailable.'),
      });
    }
  }

  async getCapability(): Promise<SessionRecordingCapability> {
    return this.readCapability();
  }

  async startRecording(payload: RecordingCommandPayload): Promise<SessionRecordingCapability> {
    return this.runExclusive(async () => {
      try {
        const result = await runShellCommand(
          this.options.startCommand,
          'start',
          buildRecordingEnv(this.options.config, payload),
        );
        const capability = parseCapabilityOutput(result.stdout, this.options.label, this.options.provider);
        return capability;
      } catch (error) {
        console.error('Session recording start command failed', error);
        return this.readCapability(payload, getSafeCommandErrorDetail(error, getCommandFailureDetail('start')));
      }
    });
  }

  async stopRecording(payload: RecordingCommandPayload): Promise<SessionRecordingCapability> {
    return this.runExclusive(async () => {
      try {
        const result = await runShellCommand(
          this.options.stopCommand,
          'stop',
          buildRecordingEnv(this.options.config, payload),
        );
        const capability = parseCapabilityOutput(result.stdout, this.options.label, this.options.provider);
        if (!capability.recording || payload.disposition === 'discard') {
          return capability;
        }

        try {
          const finalizedRecording = await finalizeRecordingMetadata({
            config: this.options.config,
            recording: capability.recording,
            sessionSnapshot: payload.sessionSnapshot,
            timelineEvents: payload.timelineEvents,
          });

          return {
            ...capability,
            recording: finalizedRecording,
          };
        } catch (metadataError) {
          console.warn('Session recording metadata finalization failed.', metadataError);
          return capability;
        }
      } catch (error) {
        console.error('Session recording stop command failed', error);
        return this.readCapability(payload, getSafeCommandErrorDetail(error, getCommandFailureDetail('stop')));
      }
    });
  }
}

function getMissingCommandNames(commands: {
  statusCommand: string | null;
  startCommand: string | null;
  stopCommand: string | null;
}) {
  return [
    commands.statusCommand ? null : 'status',
    commands.startCommand ? null : 'start',
    commands.stopCommand ? null : 'stop',
  ].filter((value): value is 'status' | 'start' | 'stop' => value != null);
}

export function createSessionRecordingController(config: BravePawsServerConfig): SessionRecordingController {
  const statusCommand = toShellString(config.recordingStatusCommand);
  const startCommand = toShellString(config.recordingStartCommand);
  const stopCommand = toShellString(config.recordingStopCommand);

  if (config.recordingProvider === 'command') {
    const missingCommands = getMissingCommandNames({
      statusCommand,
      startCommand,
      stopCommand,
    });

    if (!missingCommands.length) {
      return new CommandSessionRecordingController({
        config,
        label: config.recordingLabel,
        provider: config.recordingProvider,
        statusCommand: statusCommand!,
        startCommand: startCommand!,
        stopCommand: stopCommand!,
      });
    }

    return new UnsupportedSessionRecordingController({
      label: config.recordingLabel,
      provider: config.recordingProvider,
      detail: `Session recording command provider is misconfigured: missing ${missingCommands.join(', ')} command${missingCommands.length === 1 ? '' : 's'}.`,
    });
  }

  return new UnsupportedSessionRecordingController({
    label: config.recordingLabel,
    provider: 'none',
    detail: 'This backend does not expose session recording.',
  });
}
