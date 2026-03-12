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
  saveSpreadsheetId,
  loadSpreadsheetId,
  saveLastSync,
  loadLastSync,
  tokensFromGISResponse,
  findOrCreateFolder,
  findSpreadsheet,
  createSpreadsheet,
  writeSheetData,
  readSheetData,
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
  const tokens = { access_token: 'abc', expires_at: 9999999 };
  saveTokens(tokens);
  assert.deepEqual(loadTokens(), tokens);
});

test('loadTokens returns null for malformed JSON', () => {
  localStore.set('google_drive_tokens', '{ not json }');
  assert.equal(loadTokens(), null);
});

test('clearTokens removes tokens, folderId, spreadsheetId and lastSync from localStorage', () => {
  saveTokens({ access_token: 'a', expires_at: 1 });
  saveFolderId('folder-1');
  saveSpreadsheetId('sheet-1');
  saveLastSync(12345);

  clearTokens();

  assert.equal(loadTokens(), null);
  assert.equal(loadFolderId(), null);
  assert.equal(loadSpreadsheetId(), null);
  assert.equal(loadLastSync(), 0);
});

// ── Folder / spreadsheet / last-sync persistence ─────────────────────────────

test('saveFolderId / loadFolderId roundtrip', () => {
  saveFolderId('my-folder-id');
  assert.equal(loadFolderId(), 'my-folder-id');
});

test('loadFolderId returns null when nothing is stored', () => {
  assert.equal(loadFolderId(), null);
});

test('saveSpreadsheetId / loadSpreadsheetId roundtrip', () => {
  saveSpreadsheetId('my-sheet-id');
  assert.equal(loadSpreadsheetId(), 'my-sheet-id');
});

test('loadSpreadsheetId returns null when nothing is stored', () => {
  assert.equal(loadSpreadsheetId(), null);
});

test('saveLastSync / loadLastSync roundtrip', () => {
  saveLastSync(1700000000000);
  assert.equal(loadLastSync(), 1700000000000);
});

test('loadLastSync returns 0 when nothing is stored', () => {
  assert.equal(loadLastSync(), 0);
});

// ── tokensFromGISResponse ─────────────────────────────────────────────────────

test('tokensFromGISResponse computes expires_at with buffer', () => {
  const before = Date.now();
  const tokens = tokensFromGISResponse('at', 3600);
  const after = Date.now();

  assert.equal(tokens.access_token, 'at');
  // expires_at should be roughly now + (3600 - 60) * 1000
  const expectedMin = before + (3600 - 60) * 1000;
  const expectedMax = after + (3600 - 60) * 1000;
  assert.ok(tokens.expires_at >= expectedMin, 'expires_at lower bound');
  assert.ok(tokens.expires_at <= expectedMax, 'expires_at upper bound');
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

// ── findSpreadsheet ──────────────────────────────────────────────────────────

test('findSpreadsheet returns null when no matching spreadsheet exists', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({ files: [] });

  const result = await findSpreadsheet('access-token', 'folder-id');

  assert.equal(result, null);
});

test('findSpreadsheet returns spreadsheet metadata when found', async () => {
  const sheetInfo = { id: 'sheet-123', modifiedTime: '2024-01-01T00:00:00.000Z' };
  (global as Record<string, unknown>).fetch = makeFetch({ files: [sheetInfo] });

  const result = await findSpreadsheet('access-token', 'folder-id');

  assert.deepEqual(result, sheetInfo);
});

test('findSpreadsheet throws on API error', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({}, 403);

  await assert.rejects(
    () => findSpreadsheet('access-token', 'folder-id'),
    /Spreadsheet search failed \(403\)/,
  );
});

// ── createSpreadsheet ────────────────────────────────────────────────────────

test('createSpreadsheet creates a spreadsheet and renames the sheet tab', async () => {
  let callCount = 0;
  const capturedUrls: string[] = [];
  (global as Record<string, unknown>).fetch = async (url: unknown) => {
    callCount++;
    capturedUrls.push(String(url));
    if (callCount === 1) {
      // Drive API: create file
      return { ok: true, status: 200, json: async () => ({ id: 'new-sheet-id' }) } as unknown as Response;
    }
    // Sheets API: rename tab
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  };

  const id = await createSpreadsheet('token', 'folder-id');

  assert.equal(id, 'new-sheet-id');
  assert.equal(callCount, 2, 'should make a Drive create call then a Sheets rename call');
  assert.ok(capturedUrls[0].includes('googleapis.com/drive/'), 'first call is Drive API');
  assert.ok(capturedUrls[1].includes('sheets.googleapis.com'), 'second call is Sheets API');
});

test('createSpreadsheet throws when Drive create fails', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({}, 500);

  await assert.rejects(
    () => createSpreadsheet('token', 'folder-id'),
    /Spreadsheet creation failed \(500\)/,
  );
});

// ── writeSheetData ───────────────────────────────────────────────────────────

test('writeSheetData clears then writes data', async () => {
  let callCount = 0;
  const capturedMethods: string[] = [];
  (global as Record<string, unknown>).fetch = async (_url: unknown, opts: RequestInit) => {
    callCount++;
    capturedMethods.push(opts.method ?? 'GET');
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  };

  await writeSheetData('token', 'sheet-id', [['Header'], ['Row1']]);

  assert.equal(callCount, 2, 'should clear then write');
  assert.equal(capturedMethods[0], 'POST', 'clear uses POST');
  assert.equal(capturedMethods[1], 'PUT', 'write uses PUT');
});

test('writeSheetData throws when clear fails', async () => {
  (global as Record<string, unknown>).fetch = async () =>
    ({ ok: false, status: 403 }) as unknown as Response;

  await assert.rejects(
    () => writeSheetData('token', 'sheet-id', [['data']]),
    /Sheet clear failed \(403\)/,
  );
});

test('writeSheetData throws when write fails', async () => {
  let callCount = 0;
  (global as Record<string, unknown>).fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }
    return { ok: false, status: 400, text: async () => 'Bad Request' } as unknown as Response;
  };

  await assert.rejects(
    () => writeSheetData('token', 'sheet-id', [['data']]),
    /Sheet write failed \(400\)/,
  );
});

// ── readSheetData ────────────────────────────────────────────────────────────

test('readSheetData returns values from the sheet', async () => {
  const values = [['Date', 'Duration'], ['2024-01-01', '60']];
  (global as Record<string, unknown>).fetch = makeFetch({ values });

  const result = await readSheetData('token', 'sheet-id');

  assert.deepEqual(result, values);
});

test('readSheetData returns empty array when sheet is empty', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({});

  const result = await readSheetData('token', 'sheet-id');

  assert.deepEqual(result, []);
});

test('readSheetData throws on API error', async () => {
  (global as Record<string, unknown>).fetch = makeFetch({}, 500);

  await assert.rejects(
    () => readSheetData('token', 'sheet-id'),
    /Sheet read failed \(500\)/,
  );
});
