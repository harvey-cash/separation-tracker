import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { BravePawsServerConfig } from './config.js';

const execFileAsync = promisify(execFile);

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

async function runShellCommand(command: string) {
  try {
    return await execFileAsync('/bin/sh', ['-lc', command], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed';
    throw new Error(message);
  }
}

class UnsupportedCameraStreamingController implements CameraStreamingController {
  async getCapability(): Promise<CameraStreamingCapability> {
    return {
      key: 'cameraStreaming',
      label: 'Camera streaming',
      provider: 'none',
      supported: false,
      canSetEnabled: false,
      enabled: null,
      detail: 'This backend does not expose camera streaming control.',
    };
  }

  async setEnabled(): Promise<CameraStreamingCapability> {
    return this.getCapability();
  }
}

class CommandCameraStreamingController implements CameraStreamingController {
  constructor(
    private readonly options: {
      label: string;
      provider: string;
      statusCommand: string;
      enableCommand: string;
      disableCommand: string;
    },
  ) {}

  async getCapability(): Promise<CameraStreamingCapability> {
    try {
      const result = await runShellCommand(this.options.statusCommand);
      const enabled = parseEnabledValue(result.stdout);

      return {
        key: 'cameraStreaming',
        label: this.options.label,
        provider: this.options.provider,
        supported: true,
        canSetEnabled: true,
        enabled,
        detail: enabled == null ? 'Camera streaming status is available but could not be parsed.' : null,
      };
    } catch (error) {
      return {
        key: 'cameraStreaming',
        label: this.options.label,
        provider: this.options.provider,
        supported: true,
        canSetEnabled: true,
        enabled: null,
        detail: error instanceof Error ? error.message : 'Camera streaming status unavailable',
      };
    }
  }

  async setEnabled(enabled: boolean): Promise<CameraStreamingCapability> {
    const command = enabled ? this.options.enableCommand : this.options.disableCommand;
    await runShellCommand(command);
    return this.getCapability();
  }
}

export function createCameraStreamingController(config: BravePawsServerConfig): CameraStreamingController {
  const statusCommand = toShellString(config.cameraControlStatusCommand);
  const enableCommand = toShellString(config.cameraControlEnableCommand);
  const disableCommand = toShellString(config.cameraControlDisableCommand);

  if (
    config.cameraControlProvider === 'command'
    && statusCommand
    && enableCommand
    && disableCommand
  ) {
    return new CommandCameraStreamingController({
      label: config.cameraControlLabel,
      provider: config.cameraControlProvider,
      statusCommand,
      enableCommand,
      disableCommand,
    });
  }

  return new UnsupportedCameraStreamingController();
}

export async function getBackendCapabilities(controller: CameraStreamingController): Promise<BackendCapabilities> {
  return {
    cameraStreaming: await controller.getCapability(),
  };
}
