import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { BravePawsServerConfig } from './config.js';

const execFileAsync = promisify(execFile);

type CameraControlCommandKind = 'status' | 'enable' | 'disable';

export type CameraStreamingCapability = {
  key: 'cameraStreaming';
  label: string;
  provider: string;
  supported: boolean;
  canSetEnabled: boolean;
  enabled: boolean | null;
  detail: string | null;
};

export type BackendCapabilities = {
  cameraStreaming: CameraStreamingCapability;
};

export interface CameraStreamingController {
  getCapability(): Promise<CameraStreamingCapability>;
  setEnabled(enabled: boolean): Promise<CameraStreamingCapability>;
}

class CameraControlCommandError extends Error {
  constructor(
    message: string,
    readonly safeDetail: string,
  ) {
    super(message);
    this.name = 'CameraControlCommandError';
  }
}

function toShellString(command: string | null | undefined): string | null {
  const trimmed = command?.trim();
  return trimmed ? trimmed : null;
}

function parseEnabledValue(raw: string): boolean | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as { enabled?: unknown };
    if (typeof parsed?.enabled === 'boolean') {
      return parsed.enabled;
    }
  } catch {
    // Fall through to common string values.
  }

  const normalized = trimmed.toLowerCase();
  if (['1', 'true', 'enabled', 'on', 'active', 'running', 'yes'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'disabled', 'off', 'inactive', 'stopped', 'no'].includes(normalized)) {
    return false;
  }

  return null;
}

function getCommandFailureDetail(kind: CameraControlCommandKind): string {
  if (kind === 'status') {
    return 'Camera streaming status unavailable.';
  }

  return kind === 'enable'
    ? 'Unable to turn camera streaming on right now.'
    : 'Unable to turn camera streaming off right now.';
}

function getSafeCommandErrorDetail(error: unknown, fallback: string): string {
  if (error instanceof CameraControlCommandError) {
    return error.safeDetail;
  }

  return fallback;
}

async function runShellCommand(command: string, kind: CameraControlCommandKind) {
  try {
    return await execFileAsync('/bin/sh', ['-c', command], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    throw new CameraControlCommandError(message, getCommandFailureDetail(kind));
  }
}

function buildCapability(options: {
  label: string;
  provider: string;
  supported: boolean;
  canSetEnabled: boolean;
  enabled?: boolean | null;
  detail?: string | null;
}): CameraStreamingCapability {
  return {
    key: 'cameraStreaming',
    label: options.label,
    provider: options.provider,
    supported: options.supported,
    canSetEnabled: options.canSetEnabled,
    enabled: options.enabled ?? null,
    detail: options.detail ?? null,
  };
}

class UnsupportedCameraStreamingController implements CameraStreamingController {
  constructor(
    private readonly options: {
      label: string;
      provider: string;
      detail: string;
    },
  ) {}

  async getCapability(): Promise<CameraStreamingCapability> {
    return buildCapability({
      label: this.options.label,
      provider: this.options.provider,
      supported: false,
      canSetEnabled: false,
      detail: this.options.detail,
    });
  }

  async setEnabled(): Promise<CameraStreamingCapability> {
    return this.getCapability();
  }
}

class CommandCameraStreamingController implements CameraStreamingController {
  private operationQueue = Promise.resolve();

  constructor(
    private readonly options: {
      label: string;
      provider: string;
      statusCommand: string;
      enableCommand: string;
      disableCommand: string;
    },
  ) {}

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readCapability(detailOverride: string | null = null): Promise<CameraStreamingCapability> {
    try {
      const result = await runShellCommand(this.options.statusCommand, 'status');
      const enabled = parseEnabledValue(result.stdout);

      return buildCapability({
        label: this.options.label,
        provider: this.options.provider,
        supported: true,
        canSetEnabled: true,
        enabled,
        detail: detailOverride ?? (enabled == null ? 'Camera streaming status is available but could not be parsed.' : null),
      });
    } catch (error) {
      console.error('Camera streaming status command failed', error);
      return buildCapability({
        label: this.options.label,
        provider: this.options.provider,
        supported: true,
        canSetEnabled: true,
        enabled: null,
        detail: detailOverride ?? getSafeCommandErrorDetail(error, 'Camera streaming status unavailable.'),
      });
    }
  }

  async getCapability(): Promise<CameraStreamingCapability> {
    return this.readCapability();
  }

  async setEnabled(enabled: boolean): Promise<CameraStreamingCapability> {
    return this.runExclusive(async () => {
      const kind: CameraControlCommandKind = enabled ? 'enable' : 'disable';
      const command = enabled ? this.options.enableCommand : this.options.disableCommand;

      try {
        await runShellCommand(command, kind);
        return this.readCapability();
      } catch (error) {
        console.error(`Camera streaming ${kind} command failed`, error);
        return this.readCapability(getSafeCommandErrorDetail(error, getCommandFailureDetail(kind)));
      }
    });
  }
}

function getMissingCommandNames(commands: {
  statusCommand: string | null;
  enableCommand: string | null;
  disableCommand: string | null;
}) {
  return [
    commands.statusCommand ? null : 'status',
    commands.enableCommand ? null : 'enable',
    commands.disableCommand ? null : 'disable',
  ].filter((value): value is 'status' | 'enable' | 'disable' => value != null);
}

export function createCameraStreamingController(config: BravePawsServerConfig): CameraStreamingController {
  const statusCommand = toShellString(config.cameraControlStatusCommand);
  const enableCommand = toShellString(config.cameraControlEnableCommand);
  const disableCommand = toShellString(config.cameraControlDisableCommand);

  if (config.cameraControlProvider === 'command') {
    const missingCommands = getMissingCommandNames({
      statusCommand,
      enableCommand,
      disableCommand,
    });

    if (!missingCommands.length) {
      return new CommandCameraStreamingController({
        label: config.cameraControlLabel,
        provider: config.cameraControlProvider,
        statusCommand: statusCommand!,
        enableCommand: enableCommand!,
        disableCommand: disableCommand!,
      });
    }

    return new UnsupportedCameraStreamingController({
      label: config.cameraControlLabel,
      provider: config.cameraControlProvider,
      detail: `Camera streaming command provider is misconfigured: missing ${missingCommands.join(', ')} command${missingCommands.length === 1 ? '' : 's'}.`,
    });
  }

  return new UnsupportedCameraStreamingController({
    label: config.cameraControlLabel,
    provider: 'none',
    detail: 'This backend does not expose camera streaming control.',
  });
}

export async function getBackendCapabilities(controller: CameraStreamingController): Promise<BackendCapabilities> {
  return {
    cameraStreaming: await controller.getCapability(),
  };
}
