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
  assert.match(html, /id="remote-preview-hint"/);
  assert.match(html, /id="camera-url-text"/);
  assert.match(html, /id="copy-camera-url"/);
  assert.doesNotMatch(html, /id="remote-profile"/);
  assert.match(html, /\.\/styles\.css/);
  assert.match(html, /\.\/app\.js/);
  assert.match(html, /id="launch-helper"/);
  assert.match(html, /id="download-helper"/);
  assert.match(html, /github\.com\/harvey-cash\/separation-tracker\/releases\/latest/);
  assert.match(clientScript, /hour12:\s*false/);
  assert.match(clientScript, /window\.location\.hash/);
  assert.match(clientScript, /new EventSource/);
  assert.match(clientScript, /navigator\.clipboard\?\.writeText/);
  assert.match(clientScript, /currentPayload\?\.state\?\.preview\?\.publicUrl/);
  assert.doesNotMatch(clientScript, /currentPayload\?\.state\?\.preview\?\.pairingUrl/);
  assert.match(clientScript, /Remote preview uses/);
  assert.doesNotMatch(clientScript, /elements\.remoteProfile/);
  assert.match(clientScript, /brave-paws-streamer:\/\/launch/);
  assert.match(clientScript, /Get Latest .* Release/);
  assert.match(clientScript, /window\.open\(elements\.downloadHelper\.href/);
  assert.match(serverScript, /buildHostedUiLaunchUrl/);
  assert.match(serverScript, /STREAMER_PROTOCOL_SCHEME = 'brave-paws-streamer'/);
  assert.match(serverScript, /HKCU\\\\Software\\\\Classes\\\\\$\{STREAMER_PROTOCOL_SCHEME\}/);
});
