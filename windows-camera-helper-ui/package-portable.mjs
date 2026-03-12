import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distRoot = path.join(repoRoot, 'dist');
const bundleName = 'brave-paws-camera-helper';
const bundleRoot = path.join(distRoot, bundleName);
const zipPath = path.join(distRoot, `${bundleName}.zip`);
const exeName = 'BravePawsCameraHelper.exe';

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function copyIfExists(sourcePath, destinationPath) {
  if (!existsSync(sourcePath)) {
    return;
  }

  await fs.cp(sourcePath, destinationPath, { recursive: true });
}

async function main() {
  const rootPackageJsonPath = path.join(repoRoot, 'package.json');
  const rootPackageJson = JSON.parse(await fs.readFile(rootPackageJsonPath, 'utf8'));

  await fs.mkdir(distRoot, { recursive: true });
  await fs.rm(bundleRoot, { recursive: true, force: true });
  await fs.rm(zipPath, { force: true });

  await fs.mkdir(path.join(bundleRoot, 'windows-camera-helper'), { recursive: true });
  await fs.mkdir(path.join(bundleRoot, 'windows-camera-helper-ui'), { recursive: true });

  const helperFiles = [
    'README.md',
    'start-camera-gui.bat',
    'start-camera.bat',
    'setup-and-run.ps1',
    'go2rtc.exe',
    'cloudflared.exe',
    'ffmpeg.exe',
    'go2rtc.yaml',
  ];

  for (const fileName of helperFiles) {
    await copyIfExists(
      path.join(repoRoot, 'windows-camera-helper', fileName),
      path.join(bundleRoot, 'windows-camera-helper', fileName),
    );
  }

  await copyIfExists(
    path.join(repoRoot, 'windows-camera-helper-ui', 'public'),
    path.join(bundleRoot, 'windows-camera-helper-ui', 'public'),
  );

  const pkgOutputBase = path.join(bundleRoot, exeName.replace(/\.exe$/i, ''));
  await runProcess(process.execPath, [
    path.join(repoRoot, 'node_modules', 'pkg', 'lib-es5', 'bin.js'),
    'windows-camera-helper-ui/server.cjs',
    '-t',
    'node18-win-x64',
    '--public',
    '--no-bytecode',
    '-o',
    pkgOutputBase,
  ], repoRoot);

  const bundlePackageJson = {
    name: 'brave-paws-camera-helper',
    private: true,
    version: rootPackageJson.version,
  };

  await fs.writeFile(path.join(bundleRoot, 'package.json'), `${JSON.stringify(bundlePackageJson, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(bundleRoot, 'README.md'),
    [
      '# Brave Paws Camera Helper Portable Bundle',
      '',
      'This folder contains the Windows camera helper as a single executable launcher plus sidecar streaming binaries.',
      '',
      '## Run',
      '',
      '1. Open the windows-camera-helper folder.',
      '2. Double-click start-camera-gui.bat.',
      '',
      `The batch launcher starts ${exeName}, which already bundles the Node runtime and helper app.`,
      'go2rtc.exe, cloudflared.exe, and ffmpeg.exe remain normal sidecar files in the windows-camera-helper folder.',
      '',
    ].join('\n'),
    'utf8',
  );

  if (process.platform === 'win32') {
    await runProcess('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${bundleRoot.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ], repoRoot);
  }

  console.log(`Portable helper bundle created at ${bundleRoot}`);
  console.log(`Single-file launcher created at ${path.join(bundleRoot, exeName)}`);
  if (process.platform === 'win32') {
    console.log(`Portable helper zip created at ${zipPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});