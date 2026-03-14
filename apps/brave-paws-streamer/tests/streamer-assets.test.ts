import test from 'node:test';
import assert from 'node:assert/strict';

import streamerAssets from '../windows-camera-helper-ui/streamer-assets.cjs';

const {
  STREAMER_DEPENDENCIES,
  STREAMER_EXE_NAME,
  STREAMER_SUPPORT_FILES,
  getPortableBundleReadmeLines,
} = streamerAssets;

test('portable bundle keeps BravePawsStreamer.exe as the only launch entry point', () => {
  assert.equal(STREAMER_EXE_NAME, 'BravePawsStreamer.exe');
  assert.deepEqual(STREAMER_SUPPORT_FILES, ['README.md', 'go2rtc.yaml']);
  assert.ok(
    !STREAMER_SUPPORT_FILES.some((fileName) => /\.(bat|ps1)$/i.test(fileName)),
    'Support files should not include .bat or .ps1 launcher scripts',
  );
});

test('streamer dependency manifest auto-downloads go2rtc, cloudflared, and ffmpeg', () => {
  assert.deepEqual(
    STREAMER_DEPENDENCIES.map((dependency) => dependency.name),
    ['go2rtc', 'cloudflared', 'ffmpeg'],
  );
  assert.match(
    STREAMER_DEPENDENCIES.find((dependency) => dependency.name === 'ffmpeg')?.downloadUrl || '',
    /ffmpeg-master-latest-win64-gpl\.zip$/,
  );
});

test('portable bundle README explains the single executable flow', () => {
  const readme = getPortableBundleReadmeLines().join('\n');

  assert.match(readme, /Double-click BravePawsStreamer\.exe\./);
  assert.match(readme, /single executable entry point/i);
  assert.match(readme, /downloads go2rtc, cloudflared, and ffmpeg/i);
  assert.match(readme, /https:\/\/harvey\.cash\/separation\/streamer\//i);
});
