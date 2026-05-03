import type { Session } from '../types';

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildSessionFingerprint(session: Omit<Session, 'id'> | Session): string {
  return JSON.stringify({
    date: session.date,
    totalDurationSeconds: session.totalDurationSeconds,
    anxietyScore: session.anxietyScore ?? null,
    exercisedLevel: session.exercisedLevel ?? null,
    anyoneHome: session.anyoneHome ?? '',
    notes: session.notes ?? '',
    status: session.status,
    steps: session.steps.map((step) => ({
      durationSeconds: step.durationSeconds,
      status: step.status,
    })),
  });
}

export function buildImportedSessionId(
  session: Omit<Session, 'id'> | Session,
  occurrence = 0,
): string {
  const fingerprint = buildSessionFingerprint(session);
  return `csv-${hashString(`${fingerprint}|${occurrence}`)}`;
}
