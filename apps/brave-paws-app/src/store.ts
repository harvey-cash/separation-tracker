import { useState, useEffect } from 'react';
import { Session } from './types';
import { mergeSessionsById } from './utils/sessionSync';
import { normalizeSession, normalizeSessions } from './utils/sessionStatus';

const STORAGE_KEY = 'csa_tracker_sessions';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return normalizeSessions(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse sessions', e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  const addSession = (session: Session) => {
    const normalized = normalizeSession(session);
    if (!normalized) {
      return;
    }

    setSessions((prev) => [...prev, normalized]);
  };

  const updateSession = (updated: Session) => {
    const normalized = normalizeSession(updated);
    if (!normalized) {
      return;
    }

    setSessions((prev) =>
      prev.map((s) => (s.id === normalized.id ? normalized : s))
    );
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const replaceSessions = (incoming: Session[]) => {
    setSessions(normalizeSessions(incoming));
  };

  const upsertSessions = (incoming: Session[]) => {
    setSessions((prev) => mergeSessionsById(prev, incoming, { prefer: 'secondary' }));
  };

  return { sessions, addSession, updateSession, deleteSession, replaceSessions, upsertSessions };
}
