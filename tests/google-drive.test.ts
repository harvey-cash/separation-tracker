/**
 * Unit tests for src/utils/googleDrive.ts
 *
 * All Google API HTTP calls are intercepted via a lightweight global.fetch mock.
 * localStorage is provided by an in-memory Map so no browser environment is needed.
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock browser globals (accessed lazily, so setting before test callbacks is fine) ──

const localStore = new Map<string, string>();
(global as Record<string, unknown>).localStorage = {
  getItem: (key: string) => localStore.get(key) ?? null,
  setItem: (key: string, value: string) => { localStore.set(key, value); },
  removeItem: (key: string) => { localStore.delete(key); },
  clear: () => { localStore.clear(); },
};

const sessionStore = new Map<string, string>();
(global as Record<string, unknown>).sessionStorage = {
  getItem: (key: string) => sessionStore.get(key) ?? null,
  setItem: (key: string, value: string) => { sessionStore.set(key, value); },
  removeItem: (key: string) => { sessionStore.delete(key); },
  clear: () => { sessionStore.clear(); },
};

// Import AFTER setting up globals so function calls see the mocks.
import {
  saveTokens,
  loadTokens,
  clearTokens,
  saveFolderId,
  loadFolderId,
  saveLastSync,
  loadLastSync,
  buildAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  findOrCreateFolder,
  findFile,
  uploadFile,
  CODE_VERIFIER_KEY,
  REDIRECT_URI_KEY,
  LAST_SYNC_KEY,
} from '../src/utils/googleDrive.ts';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeFetch(body: unknown, status = 200) {
  return async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    }) as unknown as Response;
}

// ── Reset storage before every test ───────────────────────────────────────────

beforeEach(() => {
  localStore.clear();
  sessionStore.clear();
});

// ── Token persistence ──────────────────────────────────────────────────────────

test('loadTokens returns null when nothing is stored', () => {
  assert.equal(loadTokens(), null);
});

test('saveTokens / loadTokens roundtrip', () => {
  const tokens = { access_token: 'abc', refresh_token: 'xyz', expires_at: 9999999 };
  saveTokens(tokens);
  assert.deepEqual(loadTokens(), tokens);
});

test('loadTokens returns null for malformed JSON', () => {
  localStore.set('google_drive_tokens', '{ not json }');
  assert.equal(loadTokens(), null);
});

test('clearTokens removes tokens, folderId and lastSync from localStorage', () => {
  saveTokens({ access_token: 'a', expires_at: 1 });
  saveFolderId('folder-1');
  saveLastSync(12345);

  clearTokens();

  assert.equal(loadTokens(), null);
  assert.equal(loadFolderId(), null);
  assert.equal(loadLastSync(), 0);
});

test('clearTokens also removes PKCE data from localStorage', () => {
  localStore.set(CODE_VERIFIER_KEY, 'verifier-value');
  localStore.set(REDIRECT_URI_KEY, 'https://example.com/');
  clearTokens();
  assert.equal(localStore.get(CODE_VERIFIER_KEY), undefined);
  assert.equal(localStore.get(REDIRECT_URI_KEY), undefined);
});

// ── Folder / last-sync persistence ────────────────────────────────────────────

test('saveFolderId / loadFolderId roundtrip', () => {
  saveFolderId('my-folder-id');
  assert.equal(loadFolderId(), 'my-folder-id');
});

test('loadFolderId returns null when nothing is stored', () => {
  assert.equal(loadFolderId(), null);
});

test('saveLastSync / loadLastSync roundtrip', () => {
  saveLastSync(1700000000000);
  assert.equal(loadLastSync(), 1700000000000);
});

test('loadLastSync returns 0 when nothing is stored', () => {
  assert.equal(loadLastSync(), 0);
});

// ── buildAuthUrl ──────────────────────────────────────────────────────────────

test('buildAuthUrl constructs a valid Google OAuth URL', () => {
  const url = new URL(buildAuthUrl('client-id', 'https://example.com/cb', 'challenge-abc'));

  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/cb');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge-abc');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
});

// ── exchangeCodeForTokens ─────────────────────────────────────────────────────

test('exchangeCodeForTokens returns DriveTokens on success', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({
    access_token: 'at',
    refresh_token: 'rt',
    expires_in: 3600,
  });

  const tokens = await exchangeCodeForTokens('code', 'cid', 'https://r.uri', 'verifier');

  assert.equal(tokens.access_token, 'at');
  assert.equal(tokens.refresh_token, 'rt');
  assert.ok(tokens.expires_at > Date.now(), 'expires_at should be in the future');
});

test('exchangeCodeForTokens throws on non-ok response', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({ error: 'invalid_grant' }, 400);

  await assert.rejects(
    () => exchangeCodeForTokens('bad-code', 'cid', 'https://r.uri', 'verifier'),
    /Token exchange failed \(400\)/,
  );
});

// ── refreshAccessToken ────────────────────────────────────────────────────────

test('refreshAccessToken returns new tokens on success', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({
    access_token: 'new-at',
    expires_in: 3600,
  });

  const tokens = await refreshAccessToken('old-rt', 'cid');

  assert.equal(tokens.access_token, 'new-at');
  assert.ok(tokens.expires_at > Date.now(), 'expires_at should be in the future');
});

test('refreshAccessToken throws on non-ok response', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({ error: 'token_expired' }, 401);

  await assert.rejects(
    () => refreshAccessToken('expired-rt', 'cid'),
    /Token refresh failed \(401\)/,
  );
});

// ── findOrCreateFolder ────────────────────────────────────────────────────────

test('findOrCreateFolder returns existing folder ID when found', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({ files: [{ id: 'existing-folder' }] });

  const id = await findOrCreateFolder('access-token', 'MyFolder');

  assert.equal(id, 'existing-folder');
});

test('findOrCreateFolder creates and returns new folder when none exists', async () => {
  let callCount = 0;
  (global as Record<string, unknown>).fetch = async () => {
    callCount++;
    const body = callCount === 1
      ? { files: [] }                  // search returns empty
      : { id: 'new-folder-id' };       // create returns the new folder
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  };

  const id = await findOrCreateFolder('access-token', 'MyFolder');

  assert.equal(id, 'new-folder-id');
  assert.equal(callCount, 2, 'should make a search call then a create call');
});

test('findOrCreateFolder throws when search request fails', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({}, 403);

  await assert.rejects(
    () => findOrCreateFolder('access-token'),
    /Folder search failed \(403\)/,
  );
});

// ── findFile ──────────────────────────────────────────────────────────────────

test('findFile returns null when no matching file exists', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({ files: [] });

  const result = await findFile('access-token', 'folder-id');

  assert.equal(result, null);
});

test('findFile returns file metadata when file is found', async () => {
  const fileInfo = { id: 'file-123', modifiedTime: '2024-01-01T00:00:00.000Z' };
  (global as Record<string, unknown>).fetch = makeFetch({ files: [fileInfo] });

  const result = await findFile('access-token', 'folder-id');

  assert.deepEqual(result, fileInfo);
});

// ── uploadFile ────────────────────────────────────────────────────────────────

test('uploadFile uses POST when no fileId is provided (new file)', async () => {
  let capturedMethod: string | undefined;
  (global as Record<string, unknown>).fetch = async (_url: unknown, opts: RequestInit) => {
    capturedMethod = opts.method;
    return { ok: true, status: 200, json: async () => ({ id: 'created-id' }) } as unknown as Response;
  };

  const id = await uploadFile('token', 'folder-id', null, 'csv,data');

  assert.equal(capturedMethod, 'POST');
  assert.equal(id, 'created-id');
});

test('uploadFile uses PATCH when a fileId is provided (update)', async () => {
  let capturedMethod: string | undefined;
  (global as Record<string, unknown>).fetch = async (_url: unknown, opts: RequestInit) => {
    capturedMethod = opts.method;
    return { ok: true, status: 200, json: async () => ({ id: 'updated-id' }) } as unknown as Response;
  };

  const id = await uploadFile('token', 'folder-id', 'existing-file-id', 'new,csv');

  assert.equal(capturedMethod, 'PATCH');
  assert.equal(id, 'updated-id');
});

test('uploadFile throws on API error', async () => {
  (global as Record<string, unknown>).fetch = async () =>
    ({ ok: false, status: 403, text: async () => 'Forbidden' }) as unknown as Response;

  await assert.rejects(
    () => uploadFile('token', 'folder-id', null, 'data'),
    /File upload failed \(403\)/,
  );
});
