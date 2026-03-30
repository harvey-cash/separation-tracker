import { Session, SessionStatus, Step, StepStatus } from '../types';
import { format } from 'date-fns';
import { getAbortedStepCount, getCompletedStepCount } from './sessionStatus';

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
  ...Array.from({ length: STEP_COLUMN_COUNT }, (_, i) => `Step ${i + 1} Duration (s)`),
  ...Array.from({ length: STEP_COLUMN_COUNT }, (_, i) => `Step ${i + 1} Status`),
];

function escapeCSVValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function parseCSVLine(line: string): string[] {
  const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
  const values: string[] = [];
  let match;

  while ((match = regex.exec(line)) !== null) {
    values.push(match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2]);
  }

  return values;
}

function parseStepStatus(value: string | undefined, fallback: StepStatus): StepStatus {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'aborted') return 'aborted';
  if (normalized === 'pending' || normalized === 'in progress') return 'pending';
  return fallback;
}

function parseSessionStatus(value: string | undefined, fallback: SessionStatus): SessionStatus {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'aborted') return 'aborted';
  if (normalized === 'pending' || normalized === 'in progress') return 'pending';
  return fallback;
}

export function generateCSVContent(sessions: Session[]): string {
  const rows = sessions.map((session) => {
    const completedSteps = getCompletedStepCount(session.steps);
    const abortedSteps = getAbortedStepCount(session.steps);
    const score = session.anxietyScore === 0 ? 'Calm' : session.anxietyScore === 1 ? 'Coping' : session.anxietyScore === 2 ? 'Panicking' : 'N/A';
    const notes = session.notes ? escapeCSVValue(session.notes) : '';
    const exercisedLevel = session.exercisedLevel ?? '';
    const anyoneHome = session.anyoneHome ? escapeCSVValue(session.anyoneHome) : '';

    const maxDuration = session.steps.length > 0 ? Math.max(...session.steps.map((step) => step.durationSeconds)) : 0;

    const stepDurations = Array.from({ length: STEP_COLUMN_COUNT }, (_, i) => {
      return i < session.steps.length ? session.steps[i].durationSeconds : '';
    });

    const stepStatuses = Array.from({ length: STEP_COLUMN_COUNT }, (_, i) => {
      return i < session.steps.length ? session.steps[i].status : '';
    });

    return [
      format(new Date(session.date), 'yyyy-MM-dd HH:mm:ss'),
      session.status,
      session.totalDurationSeconds,
      maxDuration,
      completedSteps,
      abortedSteps,
      session.steps.length,
      score,
      notes,
      exercisedLevel,
      anyoneHome,
      ...stepDurations,
      ...stepStatuses,
    ].join(',');
  });

  return [HEADERS.join(','), ...rows].join('\n');
}

export function exportToCSV(sessions: Session[]) {
  const csvContent = generateCSVContent(sessions);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `csa_sessions_${format(new Date(), 'yyyyMMdd')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseCSV(csvContent: string): Session[] {
  const lines = csvContent.split('\n').filter((line) => line.trim() !== '');
  if (lines.length <= 1) return [];

  const headers = parseCSVLine(lines[0]);
  const getIndex = (header: string) => headers.indexOf(header);
  const getValue = (columns: string[], header: string) => {
    const index = getIndex(header);
    return index >= 0 ? columns[index] ?? '' : '';
  };

  const sessions: Session[] = [];

  for (let i = 1; i < lines.length; i++) {
    const columns = parseCSVLine(lines[i]);
    if (columns.length < 7) continue;

    const dateStr = getValue(columns, 'Date');
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) continue;

    const totalDurationSeconds = parseInt(getValue(columns, 'Total Duration (s)'), 10) || 0;
    const completedSteps = parseInt(getValue(columns, 'Completed Steps'), 10) || 0;
    const abortedSteps = parseInt(getValue(columns, 'Aborted Steps'), 10) || 0;
    const declaredTotalSteps = parseInt(getValue(columns, 'Total Steps'), 10) || 0;

    const detectedTotalSteps = Array.from({ length: STEP_COLUMN_COUNT }, (_, stepIndex) => {
      const durationValue = getValue(columns, `Step ${stepIndex + 1} Duration (s)`);
      const statusValue = getValue(columns, `Step ${stepIndex + 1} Status`);
      return durationValue || statusValue ? stepIndex + 1 : 0;
    }).reduce((max, current) => Math.max(max, current), 0);

    const totalSteps = declaredTotalSteps || detectedTotalSteps || 1;

    let anxietyScore: 0 | 1 | 2 | undefined = undefined;
    const scoreStr = getValue(columns, 'Anxiety Score');
    if (scoreStr === 'Calm') anxietyScore = 0;
    else if (scoreStr === 'Coping') anxietyScore = 1;
    else if (scoreStr === 'Panicking') anxietyScore = 2;

    let exercisedLevel: 0 | 1 | 2 | 3 | 4 | 5 | undefined = undefined;
    const parsedExerciseLevel = parseInt(getValue(columns, 'Exercised Level'), 10);
    if (!Number.isNaN(parsedExerciseLevel) && parsedExerciseLevel >= 0 && parsedExerciseLevel <= 5) {
      exercisedLevel = parsedExerciseLevel as 0 | 1 | 2 | 3 | 4 | 5;
    }

    const steps: Step[] = [];

    for (let stepIndex = 0; stepIndex < totalSteps; stepIndex++) {
      const durationStr = getValue(columns, `Step ${stepIndex + 1} Duration (s)`);
      const durationSeconds = parseInt(durationStr, 10);
      const inferredStatus: StepStatus =
        stepIndex < completedSteps ? 'completed' : stepIndex < completedSteps + abortedSteps ? 'aborted' : 'pending';

      steps.push({
        id: crypto.randomUUID(),
        durationSeconds: Number.isNaN(durationSeconds) ? 0 : durationSeconds,
        status: parseStepStatus(getValue(columns, `Step ${stepIndex + 1} Status`), inferredStatus),
      });
    }

    sessions.push({
      id: crypto.randomUUID(),
      date: date.toISOString(),
      totalDurationSeconds,
      steps,
      anxietyScore,
      exercisedLevel,
      anyoneHome: getValue(columns, 'Anyone Home'),
      notes: getValue(columns, 'Notes'),
      status: parseSessionStatus(getValue(columns, 'Session Status'), 'completed'),
    });
  }

  return sessions;
}
