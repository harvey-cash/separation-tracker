export const DRIVE_FILE_NAME = 'brave_paws_sessions.csv';
export const DRIVE_FOLDER_NAME = 'BravePaws_Data';

const TOKENS_KEY = 'google_drive_tokens';
const FOLDER_ID_KEY = 'google_drive_folder_id';
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
  localStorage.removeItem(LAST_SYNC_KEY);
}

export function saveFolderId(id: string): void {
  localStorage.setItem(FOLDER_ID_KEY, id);
}

export function loadFolderId(): string | null {
  return localStorage.getItem(FOLDER_ID_KEY);
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

export async function findFile(
  accessToken: string,
  folderId: string,
  fileName: string = DRIVE_FILE_NAME,
): Promise<DriveFileInfo | null> {
  const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
  const resp = await driveRequest(
    `/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`,
    { method: 'GET' },
    accessToken,
  );

  if (!resp.ok) {
    throw new Error(`File search failed (${resp.status})`);
  }

  const data = await resp.json() as { files: DriveFileInfo[] };
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }
  return null;
}

export async function uploadFile(
  accessToken: string,
  folderId: string,
  fileId: string | null,
  content: string,
  fileName: string = DRIVE_FILE_NAME,
): Promise<string> {
  const metadata = {
    name: fileName,
    mimeType: 'text/csv',
    ...(fileId ? {} : { parents: [folderId] }),
  };

  // Use a unique boundary per request to avoid any collision with CSV content.
  const boundary = `brave_paws_${crypto.randomUUID().replace(/-/g, '')}`;
  const body =
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: text/csv\r\n\r\n' +
    content +
    `\r\n--${boundary}--`;

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const response = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`File upload failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as { id: string };
  return data.id;
}

export async function downloadFile(
  accessToken: string,
  fileId: string,
): Promise<string> {
  const resp = await driveRequest(
    `/files/${fileId}?alt=media`,
    { method: 'GET' },
    accessToken,
  );

  if (!resp.ok) {
    throw new Error(`File download failed (${resp.status})`);
  }

  return resp.text();
}
