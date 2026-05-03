import {
  buildPairingAppUrl,
  createPairing,
  DEFAULT_CAMERA_STREAM_MODE,
  DEFAULT_CAMERA_STREAM_PROFILE,
  type CameraStreamProfile,
} from './pairings.js';
import { resolveConfig } from './config.js';

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.findIndex((entry) => entry === flag);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

async function main() {
  const config = resolveConfig();
  const args = process.argv.slice(2);
  const cameraUrl = readFlagValue(args, '--camera-url') || args[0];

  if (!cameraUrl) {
    console.error('Usage: npm run create-pairing -- --camera-url https://camera.example/live.stream');
    console.error('   or: npm run server:create-pairing -- --camera-url https://camera.example/live.stream');
    process.exitCode = 1;
    return;
  }

  if (!config.pairingEnabled) {
    console.error('Pairing broker is disabled. Set BRAVE_PAWS_ENABLE_PAIRING=true before creating pairing links.');
    process.exitCode = 1;
    return;
  }

  const profileArg = readFlagValue(args, '--profile');
  const profile: CameraStreamProfile = profileArg === 'local-quality' || profileArg === 'remote-low-latency'
    ? profileArg
    : DEFAULT_CAMERA_STREAM_PROFILE;
  const mode = readFlagValue(args, '--mode') || DEFAULT_CAMERA_STREAM_MODE;
  const ttlHoursRaw = readFlagValue(args, '--ttl-hours');
  const ttlHours = ttlHoursRaw ? Number.parseInt(ttlHoursRaw, 10) : undefined;

  const record = await createPairing(config.pairingStoreFilePath, { cameraUrl, profile, mode }, { ttlHours });

  if (!config.publicBaseUrl) {
    console.error('Pairing was created, but BRAVE_PAWS_PUBLIC_BASE_URL is not configured, so no absolute URL could be printed.');
    console.log(record.token);
    return;
  }

  const pairingUrl = buildPairingAppUrl(config.publicBaseUrl, config.appBasePath, record.token);
  console.log(pairingUrl);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
