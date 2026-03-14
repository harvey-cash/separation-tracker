import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCameraPairingUrl,
  buildCameraStreamUrl,
  CAMERA_MODE_QUERY_PARAM,
  CAMERA_PROFILE_QUERY_PARAM,
  CAMERA_URL_QUERY_PARAM,
  BRAVE_PAWS_PAIRING_URL,
  extractCameraUrlFromValue,
  getCameraUrlValidationMessage,
  getCameraUrlFromSearch,
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

test('extractCameraUrlFromValue supports Brave Paws deep links', () => {
  assert.equal(
    extractCameraUrlFromValue('https://harvey.cash/separation/app/?cameraUrl=https%3A%2F%2Fdemo.trycloudflare.com'),
    'https://demo.trycloudflare.com',
  );
});

test('isCameraUrlValid only accepts sanitized remote or local links', () => {
  assert.equal(isCameraUrlValid('https://demo.trycloudflare.com'), true);
  assert.equal(
    isCameraUrlValid('https://harvey.cash/separation/app/?cameraUrl=https%3A%2F%2Fdemo.trycloudflare.com'),
    true,
  );
  assert.equal(isCameraUrlValid('http://192.168.1.10:1984'), false);
});

test('buildCameraStreamUrl appends the go2rtc preview path once', () => {
  assert.equal(
    buildCameraStreamUrl('https://demo.trycloudflare.com/'),
    'https://demo.trycloudflare.com/stream.html?src=camera&mode=mse',
  );
});

test('buildCameraStreamUrl preserves low-latency profile metadata from pairing links', () => {
  const pairingUrl = buildCameraPairingUrl('https://demo.trycloudflare.com');

  assert.equal(
    buildCameraStreamUrl(pairingUrl),
    'https://demo.trycloudflare.com/stream.html?src=camera&mode=mse%2Cmp4%2Cmjpeg',
  );
});

test('buildCameraPairingUrl encodes the cloudflare link into the Brave Paws URL', () => {
  assert.equal(
    buildCameraPairingUrl('https://demo.trycloudflare.com'),
    `${BRAVE_PAWS_PAIRING_URL}?${CAMERA_URL_QUERY_PARAM}=https%3A%2F%2Fdemo.trycloudflare.com&${CAMERA_PROFILE_QUERY_PARAM}=remote-low-latency&${CAMERA_MODE_QUERY_PARAM}=mse%2Cmp4%2Cmjpeg`,
  );
});

test('getCameraUrlFromSearch extracts and sanitizes the deep-link query parameter', () => {
  assert.equal(
    getCameraUrlFromSearch(`?cameraUrl=https%3A%2F%2Fdemo.trycloudflare.com%2F&${CAMERA_PROFILE_QUERY_PARAM}=remote-low-latency&${CAMERA_MODE_QUERY_PARAM}=mse%2Cmp4%2Cmjpeg`),
    `${BRAVE_PAWS_PAIRING_URL}?${CAMERA_URL_QUERY_PARAM}=https%3A%2F%2Fdemo.trycloudflare.com&${CAMERA_PROFILE_QUERY_PARAM}=remote-low-latency&${CAMERA_MODE_QUERY_PARAM}=mse%2Cmp4%2Cmjpeg`,
  );
});

test('getCameraUrlValidationMessage explains empty and invalid values', () => {
  assert.match(getCameraUrlValidationMessage(''), /Brave Paws Streamer/i);
  assert.match(getCameraUrlValidationMessage('invalid'), /pairing link/i);
  assert.match(getCameraUrlValidationMessage('https://demo.trycloudflare.com'), /looks good/i);
});