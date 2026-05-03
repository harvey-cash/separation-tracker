import fs from 'node:fs/promises';
import path from 'node:path';

import type { Session } from './types.js';

export type SessionStoreData = {
  updatedAt: string | null;
  sessions: Session[];
};

const EMPTY_STORE: SessionStoreData = {
  updatedAt: null,
  sessions: [],
};

async function ensureParentDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readSessionStore(filePath: string): Promise<SessionStoreData> {
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

export async function writeSessionStore(filePath: string, sessions: Session[]): Promise<SessionStoreData> {
  await ensureParentDirectory(filePath);

  const payload: SessionStoreData = {
    updatedAt: new Date().toISOString(),
    sessions,
  };

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
