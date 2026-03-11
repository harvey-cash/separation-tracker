export const SPREADSHEET_NAME = 'Brave Paws Sessions';
export const SHEET_NAME = 'Sessions';
export const DRIVE_FOLDER_NAME = 'BravePaws_Data';

const TOKENS_KEY = 'google_drive_tokens';
const FOLDER_ID_KEY = 'google_drive_folder_id';
const SPREADSHEET_ID_KEY = 'google_sheets_spreadsheet_id';
export const LAST_SYNC_KEY = 'google_drive_last_sync';

/**
 * Seconds to subtract from `expires_in` when computing `expires_at`, so that
 * we proactively refresh the access token slightly before it actually expires.
 */
const TOKEN_EXPIRY_BUFFER_SECONDS = 60;

export type DriveTokens = {
  access_token: string;
  expires_at: number;
};

export type DriveFileInfo = {
  id: string;
  modifiedTime: string;
};

// ── Token persistence ─────────────────────────────────────────────────────────

export function saveTokens(tokens: DriveTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function loadTokens(): DriveTokens | null {
  const stored = localStorage.getItem(TOKENS_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as DriveTokens;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
  localStorage.removeItem(FOLDER_ID_KEY);
  localStorage.removeItem(SPREADSHEET_ID_KEY);
  localStorage.removeItem(LAST_SYNC_KEY);
}

export function saveFolderId(id: string): void {
  localStorage.setItem(FOLDER_ID_KEY, id);
}

export function loadFolderId(): string | null {
  return localStorage.getItem(FOLDER_ID_KEY);
}

export function saveSpreadsheetId(id: string): void {
  localStorage.setItem(SPREADSHEET_ID_KEY, id);
}

export function loadSpreadsheetId(): string | null {
  return localStorage.getItem(SPREADSHEET_ID_KEY);
}

export function saveLastSync(ts: number): void {
  localStorage.setItem(LAST_SYNC_KEY, String(ts));
}

export function loadLastSync(): number {
  return parseInt(localStorage.getItem(LAST_SYNC_KEY) ?? '0', 10) || 0;
}

/** Build a {@link DriveTokens} object from a GIS token response. */
export function tokensFromGISResponse(
  accessToken: string,
  expiresIn: number,
): DriveTokens {
  return {
    access_token: accessToken,
    expires_at: Date.now() + (expiresIn - TOKEN_EXPIRY_BUFFER_SECONDS) * 1000,
  };
}

// ── Drive REST helpers ────────────────────────────────────────────────────────

async function driveRequest(
  path: string,
  options: RequestInit,
  accessToken: string,
): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function sheetsRequest(
  path: string,
  options: RequestInit,
  accessToken: string,
): Promise<Response> {
  return fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function findOrCreateFolder(
  accessToken: string,
  folderName: string = DRIVE_FOLDER_NAME,
): Promise<string> {
  const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchResp = await driveRequest(
    `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { method: 'GET' },
    accessToken,
  );

  if (!searchResp.ok) {
    throw new Error(`Folder search failed (${searchResp.status})`);
  }

  const searchData = await searchResp.json() as { files: { id: string }[] };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createResp = await driveRequest(
    '/files',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    },
    accessToken,
  );

  if (!createResp.ok) {
    throw new Error(`Folder creation failed (${createResp.status})`);
  }

  const createData = await createResp.json() as { id: string };
  return createData.id;
}

export async function findSpreadsheet(
  accessToken: string,
  folderId: string,
): Promise<DriveFileInfo | null> {
  const query = `name='${SPREADSHEET_NAME}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  const resp = await driveRequest(
    `/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`,
    { method: 'GET' },
    accessToken,
  );

  if (!resp.ok) {
    throw new Error(`Spreadsheet search failed (${resp.status})`);
  }

  const data = await resp.json() as { files: DriveFileInfo[] };
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }
  return null;
}

export async function createSpreadsheet(
  accessToken: string,
  folderId: string,
): Promise<string> {
  // Create the spreadsheet via the Sheets API so the sheet tab title can be
  // set in the creation payload — this avoids a separate batchUpdate call
  // which returns 403 with the drive.file scope on freshly-created files.
  const createResp = await sheetsRequest(
    '',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: SPREADSHEET_NAME },
        sheets: [{ properties: { sheetId: 0, title: SHEET_NAME } }],
      }),
    },
    accessToken,
  );

  if (!createResp.ok) {
    throw new Error(`Spreadsheet creation failed (${createResp.status})`);
  }

  const data = await createResp.json() as { spreadsheetId: string };
  const spreadsheetId = data.spreadsheetId;

  // Move the new file into the target folder via Drive API.  The Sheets API
  // places new files in the Drive root by default; removing "root" as a
  // parent keeps the user's Drive tidy.
  const moveResp = await driveRequest(
    `/files/${spreadsheetId}?addParents=${encodeURIComponent(folderId)}&removeParents=root&fields=id`,
    { method: 'PATCH' },
    accessToken,
  );

  if (!moveResp.ok) {
    throw new Error(`Spreadsheet move failed (${moveResp.status})`);
  }

  return spreadsheetId;
}

export async function writeSheetData(
  accessToken: string,
  spreadsheetId: string,
  values: (string | number)[][],
): Promise<void> {
  const clearRange = SHEET_NAME;
  const writeRange = `${SHEET_NAME}!A1`;

  // Clear any existing content so stale rows don't linger.
  const clearResp = await sheetsRequest(
    `/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    accessToken,
  );

  if (!clearResp.ok) {
    throw new Error(`Sheet clear failed (${clearResp.status})`);
  }

  // Write the new data starting at A1.
  const updateResp = await sheetsRequest(
    `/${spreadsheetId}/values/${encodeURIComponent(writeRange)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    },
    accessToken,
  );

  if (!updateResp.ok) {
    const errorText = await updateResp.text();
    throw new Error(`Sheet write failed (${updateResp.status}): ${errorText}`);
  }
}

export async function readSheetData(
  accessToken: string,
  spreadsheetId: string,
): Promise<string[][]> {
  const range = `${SHEET_NAME}`;
  const resp = await sheetsRequest(
    `/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { method: 'GET' },
    accessToken,
  );

  if (!resp.ok) {
    throw new Error(`Sheet read failed (${resp.status})`);
  }

  const data = await resp.json() as { values?: string[][] };
  return data.values ?? [];
}
