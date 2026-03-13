import { useState, useEffect } from 'react';
import { Session, Step } from './types';

const STORAGE_KEY = 'csa_tracker_sessions';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
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
    setSessions((prev) => [...prev, session]);
  };

  const updateSession = (updated: Session) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const replaceSessions = (incoming: Session[]) => {
    setSessions(incoming);
  };

  return { sessions, addSession, updateSession, deleteSession, replaceSessions };
}
