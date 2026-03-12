import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCameraStreamUrl,
  getCameraUrlValidationMessage,
  isCameraUrlValid,
  sanitizeCameraUrl,
} from '../src/utils/cameraUrl.ts';

test('sanitizeCameraUrl trims whitespace and trailing slashes', () => {
  assert.equal(
    sanitizeCameraUrl('  https://example.trycloudflare.com///  '),
    'https://example.trycloudflare.com',
  );
});

test('sanitizeCameraUrl allows localhost http for local testing', () => {
  assert.equal(sanitizeCameraUrl('http://127.0.0.1:1984/'), 'http://127.0.0.1:1984');
  assert.equal(sanitizeCameraUrl('http://localhost:1984/'), 'http://localhost:1984');
});

test('sanitizeCameraUrl rejects unsupported protocols and malformed URLs', () => {
  assert.equal(sanitizeCameraUrl('ftp://example.com'), '');
  assert.equal(sanitizeCameraUrl('not a url'), '');
});

test('isCameraUrlValid only accepts sanitized remote or local links', () => {
  assert.equal(isCameraUrlValid('https://demo.trycloudflare.com'), true);
  assert.equal(isCameraUrlValid('http://192.168.1.10:1984'), false);
});

test('buildCameraStreamUrl appends the go2rtc preview path once', () => {
  assert.equal(
    buildCameraStreamUrl('https://demo.trycloudflare.com/'),
    'https://demo.trycloudflare.com/stream.html?src=camera&mode=mse',
  );
});

test('getCameraUrlValidationMessage explains empty and invalid values', () => {
  assert.match(getCameraUrlValidationMessage(''), /scan the QR code/i);
  assert.match(getCameraUrlValidationMessage('invalid'), /https link/i);
  assert.match(getCameraUrlValidationMessage('https://demo.trycloudflare.com'), /looks good/i);
});