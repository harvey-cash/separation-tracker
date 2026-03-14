import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import streamerAssets from './streamer-assets.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');
const distRoot = path.join(packageRoot, 'dist');
const bundleName = 'brave-paws-streamer';
const bundleRoot = path.join(distRoot, bundleName);
const zipPath = path.join(distRoot, `${bundleName}.zip`);
const {
  STREAMER_EXE_NAME: exeName,
  STREAMER_SUPPORT_FILES: portableSupportFiles,
  getPortableBundleReadmeLines,
} = streamerAssets;

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

function isMainModule() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;
}

async function main() {
  const rootPackageJsonPath = path.join(workspaceRoot, 'package.json');
  const rootPackageJson = JSON.parse(await fs.readFile(rootPackageJsonPath, 'utf8'));

  await fs.mkdir(distRoot, { recursive: true });
  await fs.rm(bundleRoot, { recursive: true, force: true });
  await fs.rm(zipPath, { force: true });

  await fs.mkdir(path.join(bundleRoot, 'brave-paws-streamer'), { recursive: true });

  for (const fileName of portableSupportFiles) {
    await copyIfExists(
      path.join(packageRoot, 'windows-camera-helper', fileName),
      path.join(bundleRoot, 'brave-paws-streamer', fileName),
    );
  }

  const pkgOutputBase = path.join(bundleRoot, exeName.replace(/\.exe$/i, ''));
  await runProcess(process.execPath, [
    path.join(workspaceRoot, 'node_modules', 'pkg', 'lib-es5', 'bin.js'),
    'windows-camera-helper-ui/server.cjs',
    '-t',
    'node18-win-x64',
    '--public',
    '--no-bytecode',
    '-o',
    pkgOutputBase,
  ], packageRoot);

  const bundlePackageJson = {
    name: 'brave-paws-streamer',
    private: true,
    version: rootPackageJson.version,
  };

  await fs.writeFile(path.join(bundleRoot, 'package.json'), `${JSON.stringify(bundlePackageJson, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(bundleRoot, 'README.md'),
    getPortableBundleReadmeLines(exeName).join('\n'),
    'utf8',
  );

  if (process.platform === 'win32') {
    await runProcess('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${bundleRoot.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ], packageRoot);
  }

  console.log(`Portable streamer bundle created at ${bundleRoot}`);
  console.log(`Single-file launcher created at ${path.join(bundleRoot, exeName)}`);
  if (process.platform === 'win32') {
    console.log(`Portable streamer zip created at ${zipPath}`);
  }
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
