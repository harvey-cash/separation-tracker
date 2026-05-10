import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

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
const CLIENT_DIAGNOSTICS_FILENAME = 'client_diagnostics.jsonl';
const sessionStoreLocks = new Map<string, Promise<void>>();

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
  await writeFileAtomically(csvFilePath, `${generateCSVContent(sessions)}\n`);
}

async function writeFileAtomically(filePath: string, content: string) {
  const tempFilePath = path.join(path.dirname(filePath), `${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(tempFilePath, content, 'utf8');
  await fs.rename(tempFilePath, filePath);
}

async function withSessionStoreLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = sessionStoreLocks.get(filePath) || Promise.resolve();
  let releaseLock = () => {};
  const current = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const next = previous.catch(() => undefined).then(() => current);
  sessionStoreLocks.set(filePath, next);

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseLock();
    if (sessionStoreLocks.get(filePath) === next) {
      sessionStoreLocks.delete(filePath);
    }
  }
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
  if (!importedSessions.length) {
    return writeSessionStoreUnlocked(filePath, currentStore.sessions);
  }

  return writeSessionStoreUnlocked(filePath, importedSessions);
}

async function readSessionStoreUnlocked(filePath: string): Promise<SessionStoreData> {
  const jsonStore = await readJsonStore(filePath);
  return importCsvIfNewer(filePath, jsonStore);
}

export async function readSessionStore(filePath: string): Promise<SessionStoreData> {
  return withSessionStoreLock(filePath, () => readSessionStoreUnlocked(filePath));
}

async function writeSessionStoreUnlocked(filePath: string, sessions: Session[]): Promise<SessionStoreData> {
  await ensureParentDirectory(filePath);

  const payload: SessionStoreData = {
    updatedAt: new Date().toISOString(),
    sessions,
  };

  await writeCsvFile(filePath, sessions);
  await writeFileAtomically(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export async function writeSessionStore(filePath: string, sessions: Session[]): Promise<SessionStoreData> {
  return withSessionStoreLock(filePath, () => writeSessionStoreUnlocked(filePath, sessions));
}

export async function upsertSession(filePath: string, session: Session): Promise<SessionStoreData> {
  return withSessionStoreLock(filePath, async () => {
    const current = await readSessionStoreUnlocked(filePath);
    const existingIndex = current.sessions.findIndex((entry) => entry.id === session.id);

    if (existingIndex >= 0) {
      current.sessions[existingIndex] = session;
    } else {
      current.sessions.push(session);
    }

    return writeSessionStoreUnlocked(filePath, current.sessions);
  });
}

export async function appendClientDiagnostic(filePath: string, payload: unknown): Promise<string> {
  const diagnosticsFilePath = path.join(path.dirname(filePath), CLIENT_DIAGNOSTICS_FILENAME);
  await ensureParentDirectory(diagnosticsFilePath);
  await fs.appendFile(diagnosticsFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
  return diagnosticsFilePath;
}

export function getSessionsCsvFilePath(filePath: string): string {
  return getCsvFilePath(filePath);
}

export function getClientDiagnosticsFilePath(filePath: string): string {
  return path.join(path.dirname(filePath), CLIENT_DIAGNOSTICS_FILENAME);
}
