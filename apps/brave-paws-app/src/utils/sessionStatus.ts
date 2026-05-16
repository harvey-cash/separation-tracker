import type { Session, SessionRecording, SessionRecordingStatus, SessionStatus, Step, StepStatus } from '../types';

export function isStepStatus(value: unknown): value is StepStatus {
  return value === 'pending' || value === 'completed' || value === 'aborted';
}

export function isSessionStatus(value: unknown): value is SessionStatus {
  return value === 'pending' || value === 'completed' || value === 'aborted';
}

export function isSessionRecordingStatus(value: unknown): value is SessionRecordingStatus {
  return value === 'idle' || value === 'recording' || value === 'completed' || value === 'discarded' || value === 'failed';
}

export function getStepStatusLabel(status: StepStatus): string {
  if (status === 'completed') return 'Completed';
  if (status === 'aborted') return 'Aborted';
  return 'Pending';
}

export function getSessionStatusLabel(status: SessionStatus): string {
  if (status === 'completed') return 'Completed';
  if (status === 'aborted') return 'Aborted';
  return 'In Progress';
}

export function getSessionStatusBadgeClasses(status: SessionStatus): string {
  if (status === 'completed') return 'text-emerald-700 bg-emerald-50';
  if (status === 'aborted') return 'text-amber-700 bg-amber-50';
  return 'text-slate-700 bg-slate-100';
}

export function getStepStatusBadgeClasses(status: StepStatus): string {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'aborted') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export function getStatusButtonClasses(status: SessionStatus | StepStatus, isSelected: boolean): string {
  if (!isSelected) {
    return 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700';
  }

  if (status === 'completed') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200';
  }

  if (status === 'aborted') {
    return 'border-amber-300 bg-amber-50 text-amber-700 ring-2 ring-amber-200';
  }

  return 'border-slate-300 bg-slate-100 text-slate-700 ring-2 ring-slate-200';
}

export function getCompletedStepCount(steps: Step[]): number {
  return steps.filter((step) => step.status === 'completed').length;
}

export function getAbortedStepCount(steps: Step[]): number {
  return steps.filter((step) => step.status === 'aborted').length;
}

export function getResolvedStepCount(steps: Step[]): number {
  return steps.filter((step) => step.status !== 'pending').length;
}

export function getRecordedStepDurationSeconds(step: Step): number {
  return step.actualDurationSeconds ?? step.durationSeconds;
}

export function normalizeStep(value: unknown): Step | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    durationSeconds?: unknown;
    actualDurationSeconds?: unknown;
    status?: unknown;
    completed?: unknown;
  };

  if (typeof candidate.id !== 'string') {
    return null;
  }

  const durationSeconds =
    typeof candidate.durationSeconds === 'number' && Number.isFinite(candidate.durationSeconds)
      ? Math.max(0, candidate.durationSeconds)
      : 0;

  const actualDurationSeconds =
    typeof candidate.actualDurationSeconds === 'number' && Number.isFinite(candidate.actualDurationSeconds)
      ? Math.max(0, candidate.actualDurationSeconds)
      : undefined;

  // Legacy data only stored a boolean completed flag, where false meant the step
  // had not been resolved yet. Preserve that as pending for backwards compatibility.
  const status = isStepStatus(candidate.status)
    ? candidate.status
    : candidate.completed === true
    ? 'completed'
    : 'pending';

  return {
    id: candidate.id,
    durationSeconds,
    ...(actualDurationSeconds != null ? { actualDurationSeconds } : {}),
    status,
  };
}

function normalizeSessionRecording(value: unknown, sessionId: string): SessionRecording | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const status = isSessionRecordingStatus(candidate.status) ? candidate.status : undefined;
  const provider = typeof candidate.provider === 'string' && candidate.provider.trim() ? candidate.provider : undefined;

  if (!status || !provider) {
    return undefined;
  }

  const sessionIdValue = typeof candidate.sessionId === 'string' && candidate.sessionId.trim()
    ? candidate.sessionId
    : sessionId;

  return {
    status,
    sessionId: sessionIdValue,
    provider,
    startedAt: typeof candidate.startedAt === 'string' ? candidate.startedAt : null,
    stoppedAt: typeof candidate.stoppedAt === 'string' ? candidate.stoppedAt : null,
    hasAudio: typeof candidate.hasAudio === 'boolean' ? candidate.hasAudio : false,
    relativeFilePath: typeof candidate.relativeFilePath === 'string' ? candidate.relativeFilePath : null,
    downloadPath: typeof candidate.downloadPath === 'string' ? candidate.downloadPath : null,
    metadataRelativeFilePath: typeof candidate.metadataRelativeFilePath === 'string' ? candidate.metadataRelativeFilePath : null,
    metadataDownloadPath: typeof candidate.metadataDownloadPath === 'string' ? candidate.metadataDownloadPath : null,
    durationSeconds: typeof candidate.durationSeconds === 'number' && Number.isFinite(candidate.durationSeconds)
      ? Math.max(0, candidate.durationSeconds)
      : null,
    sizeBytes: typeof candidate.sizeBytes === 'number' && Number.isFinite(candidate.sizeBytes)
      ? Math.max(0, candidate.sizeBytes)
      : null,
    chapterCount: typeof candidate.chapterCount === 'number' && Number.isFinite(candidate.chapterCount)
      ? Math.max(0, candidate.chapterCount)
      : null,
    chaptersEmbedded: typeof candidate.chaptersEmbedded === 'boolean' ? candidate.chaptersEmbedded : null,
    detail: typeof candidate.detail === 'string' ? candidate.detail : null,
  };
}

export function normalizeSession(value: unknown): Session | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    date?: unknown;
    steps?: unknown;
    totalDurationSeconds?: unknown;
    anxietyScore?: unknown;
    exercisedLevel?: unknown;
    anyoneHome?: unknown;
    notes?: unknown;
    status?: unknown;
    completed?: unknown;
    recording?: unknown;
  };

  if (typeof candidate.id !== 'string' || typeof candidate.date !== 'string' || !Array.isArray(candidate.steps)) {
    return null;
  }

  const steps = candidate.steps
    .map((step) => normalizeStep(step))
    .filter((step): step is Step => step !== null);

  const anxietyScore =
    candidate.anxietyScore === 0 || candidate.anxietyScore === 1 || candidate.anxietyScore === 2
      ? candidate.anxietyScore
      : undefined;

  const exercisedLevel =
    candidate.exercisedLevel === 0 ||
    candidate.exercisedLevel === 1 ||
    candidate.exercisedLevel === 2 ||
    candidate.exercisedLevel === 3 ||
    candidate.exercisedLevel === 4 ||
    candidate.exercisedLevel === 5
      ? candidate.exercisedLevel
      : undefined;

  const totalDurationSeconds =
    typeof candidate.totalDurationSeconds === 'number' && Number.isFinite(candidate.totalDurationSeconds)
      ? Math.max(0, candidate.totalDurationSeconds)
      : 0;

  // Older saved sessions always used completed=true at save time, so a legacy
  // false value most commonly represents an in-progress session snapshot.
  const status = isSessionStatus(candidate.status)
    ? candidate.status
    : candidate.completed === true
    ? 'completed'
    : 'pending';

  return {
    id: candidate.id,
    date: candidate.date,
    steps,
    totalDurationSeconds,
    anxietyScore,
    exercisedLevel,
    anyoneHome: typeof candidate.anyoneHome === 'string' ? candidate.anyoneHome : '',
    notes: typeof candidate.notes === 'string' ? candidate.notes : '',
    status,
    recording: normalizeSessionRecording(candidate.recording, candidate.id),
  };
}

export function normalizeSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((session) => normalizeSession(session))
    .filter((session): session is Session => session !== null);
}
