import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const disallowedPattern = /\b(?:QUANTUM|picam|Tailnet)\b/i;
const filesToCheck = [
  'src/App.tsx',
  'src/components/ActiveSession.tsx',
  'src/components/CameraLinkInput.tsx',
  'src/components/Dashboard.tsx',
  'src/components/StorageSync.tsx',
  'src/hooks/useCameraStreamingControl.ts',
  'src/hooks/useQuantumSync.ts',
  'src/hooks/useStorageSync.ts',
  'src/utils/backendCapabilities.ts',
  'src/utils/backendRequests.ts',
  'src/utils/cameraUrl.ts',
  '../brave-paws-landing/index.html',
  '../brave-paws-landing/styles.css',
];

test('frontend source avoids personal backend branding in shipped app and landing files', () => {
  for (const relativePath of filesToCheck) {
    const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
    assert.doesNotMatch(source, disallowedPattern, `Unexpected personal backend language in ${relativePath}`);
  }
});
