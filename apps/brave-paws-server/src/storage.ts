import fs from 'node:fs/promises';
import path from 'node:path';

import { generateCSVContent, parseCSV } from './csv.js';
import type { Session } from './types.js';

export type SessionStoreData = {
  updatedAt: string | null;
  sessions: Session[];
};

const EMPTY_STORE: SessionStoreData = {
  updatedAt: null,
  sessions: [],
};

const SESSIONS_CSV_FILENAME = 'brave_paws_sessions.csv';

async function ensureParentDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function getCsvFilePath(filePath: string): string {
  return path.join(path.dirname(filePath), SESSIONS_CSV_FILENAME);
}

async function readFileStat(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function readJsonStore(filePath: string): Promise<SessionStoreData> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SessionStoreData>;
    return {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions as Session[] : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY_STORE };
    }

    throw error;
  }
}

async function writeCsvFile(filePath: string, sessions: Session[]) {
  const csvFilePath = getCsvFilePath(filePath);
  await ensureParentDirectory(csvFilePath);
  await fs.writeFile(csvFilePath, `${generateCSVContent(sessions)}\n`, 'utf8');
}

async function importCsvIfNewer(filePath: string, currentStore: SessionStoreData): Promise<SessionStoreData> {
  const csvFilePath = getCsvFilePath(filePath);
  const [jsonStat, csvStat] = await Promise.all([
    readFileStat(filePath),
    readFileStat(csvFilePath),
  ]);

  if (!csvStat) {
    return currentStore;
  }

  const shouldImport = !jsonStat || csvStat.mtimeMs > jsonStat.mtimeMs;
  if (!shouldImport) {
    return currentStore;
  }

  const csvContent = await fs.readFile(csvFilePath, 'utf8');
  const importedSessions = parseCSV(csvContent);
  if (!importedSessions.length && currentStore.sessions.length > 0) {
    return currentStore;
  }

  return writeSessionStore(filePath, importedSessions);
}

export async function readSessionStore(filePath: string): Promise<SessionStoreData> {
  const jsonStore = await readJsonStore(filePath);
  return importCsvIfNewer(filePath, jsonStore);
}

export async function writeSessionStore(filePath: string, sessions: Session[]): Promise<SessionStoreData> {
  await ensureParentDirectory(filePath);

  const payload: SessionStoreData = {
    updatedAt: new Date().toISOString(),
    sessions,
  };

  await writeCsvFile(filePath, sessions);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export async function upsertSession(filePath: string, session: Session): Promise<SessionStoreData> {
  const current = await readSessionStore(filePath);
  const existingIndex = current.sessions.findIndex((entry) => entry.id === session.id);

  if (existingIndex >= 0) {
    current.sessions[existingIndex] = session;
  } else {
    current.sessions.push(session);
  }

  return writeSessionStore(filePath, current.sessions);
}

export function getSessionsCsvFilePath(filePath: string): string {
  return getCsvFilePath(filePath);
}
