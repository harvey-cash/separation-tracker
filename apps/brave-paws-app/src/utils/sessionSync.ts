import type { Session, Step } from '../types';
import { normalizeSessions } from './sessionStatus';

type MergePreference = 'primary' | 'secondary';

function serializeStep(step: Step) {
  return {
    id: step.id,
    durationSeconds: step.durationSeconds,
    status: step.status,
  };
}

function serializeSession(session: Session) {
  return {
    id: session.id,
    date: session.date,
    totalDurationSeconds: session.totalDurationSeconds,
    anxietyScore: session.anxietyScore ?? null,
    exercisedLevel: session.exercisedLevel ?? null,
    anyoneHome: session.anyoneHome ?? '',
    notes: session.notes ?? '',
    status: session.status,
    steps: session.steps.map(serializeStep),
  };
}

export function sortSessionsNewestFirst(sessions: Session[]): Session[] {
  return [...normalizeSessions(sessions)].sort((left, right) => {
    const dateDifference = new Date(right.date).getTime() - new Date(left.date).getTime();
    if (dateDifference !== 0) {
      return dateDifference;
    }

    return left.id.localeCompare(right.id);
  });
}

export function serializeSessionsForComparison(sessions: Session[]): string {
  return JSON.stringify(sortSessionsNewestFirst(sessions).map(serializeSession));
}

export function mergeSessionsById(
  primarySessions: Session[],
  secondarySessions: Session[],
  options: { prefer?: MergePreference } = {},
): Session[] {
  const prefer = options.prefer ?? 'secondary';
  const primary = normalizeSessions(primarySessions);
  const secondary = normalizeSessions(secondarySessions);
  const merged = new Map<string, Session>();

  const apply = (sessions: Session[], canOverwrite: boolean) => {
    sessions.forEach((session) => {
      if (canOverwrite || !merged.has(session.id)) {
        merged.set(session.id, session);
      }
    });
  };

  if (prefer === 'primary') {
    apply(secondary, false);
    apply(primary, true);
  } else {
    apply(primary, false);
    apply(secondary, true);
  }

  return sortSessionsNewestFirst(Array.from(merged.values()));
}
