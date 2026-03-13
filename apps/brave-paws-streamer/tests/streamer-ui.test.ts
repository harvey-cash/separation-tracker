import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('streamer UI includes a clock and package-version display', () => {
  const html = readFileSync(resolve(process.cwd(), 'windows-camera-helper-ui/public/index.html'), 'utf8');
  const clientScript = readFileSync(resolve(process.cwd(), 'windows-camera-helper-ui/public/app.js'), 'utf8');
  const serverScript = readFileSync(resolve(process.cwd(), 'windows-camera-helper-ui/server.cjs'), 'utf8');

  assert.match(
    html,
    /<div class="preview-title-row">\s*<p class="label">Laptop Preview<\/p>\s*<p class="preview-clock" id="current-time">--:--<\/p>\s*<\/div>/,
  );
  assert.doesNotMatch(html, /Local Time/);
  assert.match(html, /id="app-version"/);
  assert.match(clientScript, /hour12:\s*false/);
  assert.match(clientScript, /state\.appVersion/);
  assert.match(serverScript, /appVersion,/);
});
