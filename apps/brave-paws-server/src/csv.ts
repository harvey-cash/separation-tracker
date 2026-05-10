import type { Session, SessionStatus, Step, StepStatus } from './types.js';
import { buildImportedSessionId } from './sessionIdentity.js';

const STEP_COLUMN_COUNT = 10;
const HEADERS = [
  'Date',
  'Session Status',
  'Total Duration (s)',
  'Max Step Duration (s)',
  'Completed Steps',
  'Aborted Steps',
  'Total Steps',
  'Anxiety Score',
  'Notes',
  'Exercised Level',
  'Anyone Home',
  ...Array.from({ length: STEP_COLUMN_COUNT }, (_, index) => `Step ${index + 1} Duration (s)`),
  ...Array.from({ length: STEP_COLUMN_COUNT }, (_, index) => `Step ${index + 1} Status`),
];

function escapeCSVValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function padDatePart(input: number): string {
  return String(input).padStart(2, '0');
}

function formatCsvDate(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`;
}

function parseCsvDate(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const isoCandidate = new Date(normalized);
  if (!Number.isNaN(isoCandidate.getTime()) && (normalized.includes('T') || normalized.endsWith('Z'))) {
    return isoCandidate;
  }

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    return Number.isNaN(isoCandidate.getTime()) ? null : isoCandidate;
  }

  const [, year, month, day, hours, minutes, seconds] = match;
  const parsed = new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    Number.parseInt(hours, 10),
    Number.parseInt(minutes, 10),
    Number.parseInt(seconds, 10),
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCSVLine(line: string): string[] {
  const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
  const values: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    values.push(match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]);
  }

  return values;
}

function parseStatusValue<TStatus extends StepStatus | SessionStatus>(value: string | undefined, fallback: TStatus): TStatus {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'completed') return 'completed' as TStatus;
  if (normalized === 'aborted') return 'aborted' as TStatus;
  if (normalized === 'pending' || normalized === 'in progress') return 'pending' as TStatus;
  return fallback;
}

function getCompletedStepCount(steps: Step[]): number {
  return steps.filter((step) => step.status === 'completed').length;
}

function getAbortedStepCount(steps: Step[]): number {
  return steps.filter((step) => step.status === 'aborted').length;
}

function getAnxietyScoreLabel(score?: Session['anxietyScore']): string {
  if (score === 0) return 'Calm';
  if (score === 1) return 'Coping';
  if (score === 2) return 'Panicking';
  return 'N/A';
}

function detectTotalSteps(columns: string[], getValue: (columns: string[], header: string) => string): number {
  return Array.from({ length: STEP_COLUMN_COUNT }, (_, stepIndex) => {
    const durationValue = getValue(columns, `Step ${stepIndex + 1} Duration (s)`);
    const statusValue = getValue(columns, `Step ${stepIndex + 1} Status`);
    return durationValue || statusValue ? stepIndex + 1 : 0;
  }).reduce((max, current) => Math.max(max, current), 0);
}

export function generateCSVContent(sessions: Session[]): string {
  const rows = sessions.map((session) => {
    const completedSteps = getCompletedStepCount(session.steps);
    const abortedSteps = getAbortedStepCount(session.steps);
    const notes = session.notes ? escapeCSVValue(session.notes) : '';
    const exercisedLevel = session.exercisedLevel ?? '';
    const anyoneHome = session.anyoneHome ? escapeCSVValue(session.anyoneHome) : '';
    const maxDuration = session.steps.length > 0 ? Math.max(...session.steps.map((step) => step.durationSeconds)) : 0;

    const stepDurations = Array.from({ length: STEP_COLUMN_COUNT }, (_, index) => (
      index < session.steps.length ? session.steps[index].durationSeconds : ''
    ));
    const stepStatuses = Array.from({ length: STEP_COLUMN_COUNT }, (_, index) => (
      index < session.steps.length ? session.steps[index].status : ''
    ));

    return [
      formatCsvDate(session.date),
      session.status,
      session.totalDurationSeconds,
      maxDuration,
      completedSteps,
      abortedSteps,
      session.steps.length,
      getAnxietyScoreLabel(session.anxietyScore),
      notes,
      exercisedLevel,
      anyoneHome,
      ...stepDurations,
      ...stepStatuses,
    ].join(',');
  });

  return [HEADERS.join(','), ...rows].join('\n');
}

export function parseCSV(content: string): Session[] {
  const lines = content.split('\n').filter((line) => line.trim() !== '');
  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCSVLine(lines[0]);
  const getIndex = (header: string) => headers.indexOf(header);
  const getValue = (columns: string[], header: string) => {
    const index = getIndex(header);
    return index >= 0 ? columns[index] ?? '' : '';
  };

  const sessions: Session[] = [];
  const occurrenceByFingerprint = new Map<string, number>();

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const columns = parseCSVLine(lines[lineIndex]);
    if (columns.length < 7) {
      continue;
    }

    const date = parseCsvDate(getValue(columns, 'Date'));
    if (!date) {
      continue;
    }

    const totalDurationSeconds = Number.parseInt(getValue(columns, 'Total Duration (s)'), 10) || 0;
    const completedSteps = Number.parseInt(getValue(columns, 'Completed Steps'), 10) || 0;
    const abortedSteps = Number.parseInt(getValue(columns, 'Aborted Steps'), 10) || 0;
    const declaredTotalSteps = Number.parseInt(getValue(columns, 'Total Steps'), 10) || 0;
    const detectedTotalSteps = detectTotalSteps(columns, getValue);
    const totalSteps = declaredTotalSteps || detectedTotalSteps || 1;

    let anxietyScore: 0 | 1 | 2 | undefined;
    const score = getValue(columns, 'Anxiety Score');
    if (score === 'Calm') anxietyScore = 0;
    else if (score === 'Coping') anxietyScore = 1;
    else if (score === 'Panicking') anxietyScore = 2;

    let exercisedLevel: 0 | 1 | 2 | 3 | 4 | 5 | undefined;
    const parsedExerciseLevel = Number.parseInt(getValue(columns, 'Exercised Level'), 10);
    if (!Number.isNaN(parsedExerciseLevel) && parsedExerciseLevel >= 0 && parsedExerciseLevel <= 5) {
      exercisedLevel = parsedExerciseLevel as 0 | 1 | 2 | 3 | 4 | 5;
    }

    const steps: Step[] = [];

    for (let stepIndex = 0; stepIndex < totalSteps; stepIndex += 1) {
      const durationStr = getValue(columns, `Step ${stepIndex + 1} Duration (s)`);
      const durationSeconds = Number.parseInt(durationStr, 10);
      const isCompletedStep = stepIndex < completedSteps;
      const isAbortedStep = !isCompletedStep && stepIndex < completedSteps + abortedSteps;
      const inferredStatus: StepStatus = isCompletedStep ? 'completed' : isAbortedStep ? 'aborted' : 'pending';

      steps.push({
        id: `step-${stepIndex + 1}`,
        durationSeconds: Number.isNaN(durationSeconds) ? 0 : durationSeconds,
        status: parseStatusValue(getValue(columns, `Step ${stepIndex + 1} Status`), inferredStatus),
      });
    }

    const sessionWithoutId = {
      date: date.toISOString(),
      totalDurationSeconds,
      steps,
      anxietyScore,
      exercisedLevel,
      anyoneHome: getValue(columns, 'Anyone Home'),
      notes: getValue(columns, 'Notes'),
      status: parseStatusValue(getValue(columns, 'Session Status'), 'completed' as SessionStatus),
    };

    const fingerprint = JSON.stringify({
      date: sessionWithoutId.date,
      totalDurationSeconds: sessionWithoutId.totalDurationSeconds,
      anxietyScore: sessionWithoutId.anxietyScore ?? null,
      exercisedLevel: sessionWithoutId.exercisedLevel ?? null,
      anyoneHome: sessionWithoutId.anyoneHome,
      notes: sessionWithoutId.notes,
      status: sessionWithoutId.status,
      steps: sessionWithoutId.steps.map((step) => ({
        durationSeconds: step.durationSeconds,
        status: step.status,
      })),
    });
    const occurrence = occurrenceByFingerprint.get(fingerprint) ?? 0;
    occurrenceByFingerprint.set(fingerprint, occurrence + 1);

    sessions.push({
      id: buildImportedSessionId(sessionWithoutId, occurrence),
      ...sessionWithoutId,
    });
  }

  return sessions;
}
