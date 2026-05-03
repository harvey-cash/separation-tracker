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
  normalizeCameraUrlValue,
  sanitizeCameraUrl,
} from '../src/utils/cameraUrl.ts';

test('sanitizeCameraUrl trims whitespace and preserves stream paths', () => {
  assert.equal(
    sanitizeCameraUrl('  https://camera.example/separation/camera/live.stream/  '),
    'https://camera.example/separation/camera/live.stream',
  );
});

test('sanitizeCameraUrl allows localhost http for local testing', () => {
  assert.equal(sanitizeCameraUrl('http://127.0.0.1:1984/live.stream/'), 'http://127.0.0.1:1984/live.stream');
  assert.equal(sanitizeCameraUrl('http://localhost:1984/live.stream/'), 'http://localhost:1984/live.stream');
});

test('sanitizeCameraUrl rejects unsupported protocols and malformed URLs', () => {
  assert.equal(sanitizeCameraUrl('ftp://example.com'), '');
  assert.equal(sanitizeCameraUrl('not a url'), '');
});

test('extractCameraUrlFromValue supports Brave Paws deep links', () => {
  assert.equal(
    extractCameraUrlFromValue(`${BRAVE_PAWS_PAIRING_URL}?cameraUrl=https%3A%2F%2Fdemo.example%2Flive.stream`),
    'https://demo.example/live.stream',
  );
});

test('isCameraUrlValid accepts direct stream links and Brave Paws deep links', () => {
  assert.equal(isCameraUrlValid('https://demo.example/live.stream'), true);
  assert.equal(
    isCameraUrlValid(`${BRAVE_PAWS_PAIRING_URL}?cameraUrl=https%3A%2F%2Fdemo.example%2Flive.stream`),
    true,
  );
  assert.equal(isCameraUrlValid('http://192.168.1.10:1984/live.stream'), false);
});

test('buildCameraStreamUrl returns the direct stream URL for Brave Paws stream links', () => {
  assert.equal(
    buildCameraStreamUrl('https://demo.example/live.stream'),
    'https://demo.example/live.stream',
  );
});

test('buildCameraStreamUrl preserves direct stream URLs when they are wrapped as pairing links', () => {
  const pairingUrl = buildCameraPairingUrl('https://demo.example/live.stream');

  assert.equal(
    buildCameraStreamUrl(pairingUrl),
    'https://demo.example/live.stream',
  );
});

test('buildCameraPairingUrl encodes the stream link into the Brave Paws app URL', () => {
  assert.equal(
    buildCameraPairingUrl('https://demo.example/live.stream'),
    `${BRAVE_PAWS_PAIRING_URL}?${CAMERA_URL_QUERY_PARAM}=https%3A%2F%2Fdemo.example%2Flive.stream&${CAMERA_PROFILE_QUERY_PARAM}=remote-low-latency&${CAMERA_MODE_QUERY_PARAM}=mse%2Cmp4%2Cmjpeg`,
  );
});

test('normalizeCameraUrlValue preserves Brave Paws deep links so stream metadata survives scanning', () => {
  const pairingUrl = `${BRAVE_PAWS_PAIRING_URL}?${CAMERA_URL_QUERY_PARAM}=https%3A%2F%2Fdemo.example%2Flive.stream&${CAMERA_PROFILE_QUERY_PARAM}=remote-low-latency&${CAMERA_MODE_QUERY_PARAM}=mse%2Cmp4%2Cmjpeg`;

  assert.equal(normalizeCameraUrlValue(pairingUrl), pairingUrl);
});

test('getCameraUrlFromSearch preserves deep-link metadata from the query parameters', () => {
  assert.equal(
    getCameraUrlFromSearch(`?cameraUrl=https%3A%2F%2Fdemo.example%2Flive.stream&${CAMERA_PROFILE_QUERY_PARAM}=remote-low-latency&${CAMERA_MODE_QUERY_PARAM}=mse%2Cmp4%2Cmjpeg`),
    `${BRAVE_PAWS_PAIRING_URL}?${CAMERA_URL_QUERY_PARAM}=https%3A%2F%2Fdemo.example%2Flive.stream&${CAMERA_PROFILE_QUERY_PARAM}=remote-low-latency&${CAMERA_MODE_QUERY_PARAM}=mse%2Cmp4%2Cmjpeg`,
  );
});

test('getCameraUrlFromSearch sanitizes invalid remote profile values to the default low-latency profile', () => {
  assert.equal(
    getCameraUrlFromSearch(`?cameraUrl=https%3A%2F%2Fdemo.example%2Flive.stream&${CAMERA_PROFILE_QUERY_PARAM}=definitely-invalid-profile`),
    `${BRAVE_PAWS_PAIRING_URL}?${CAMERA_URL_QUERY_PARAM}=https%3A%2F%2Fdemo.example%2Flive.stream&${CAMERA_PROFILE_QUERY_PARAM}=remote-low-latency&${CAMERA_MODE_QUERY_PARAM}=mse%2Cmp4%2Cmjpeg`,
  );
});

test('getCameraUrlValidationMessage explains empty and invalid values', () => {
  assert.match(getCameraUrlValidationMessage(''), /suggested picam link/i);
  assert.match(getCameraUrlValidationMessage('invalid'), /stream link/i);
  assert.match(getCameraUrlValidationMessage('https://demo.example/live.stream'), /stream link looks good/i);
});
