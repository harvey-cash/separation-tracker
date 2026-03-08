import { Session, Step } from '../types';
import { format } from 'date-fns';

export function generateCSVContent(sessions: Session[]): string {
  const headers = [
    'Date',
    'Total Duration (s)',
    'Max Step Duration (s)',
    'Completed Steps',
    'Total Steps',
    'Anxiety Score',
    'Notes',
    'Exercise Level',
    'Anybody Home',
    ...Array.from({ length: 10 }, (_, i) => `Step ${i + 1} Duration (s)`)
  ];

  const rows = sessions.map(s => {
    const completedSteps = s.steps.filter(step => step.completed).length;
    const score = s.anxietyScore === 0 ? 'Calm' : s.anxietyScore === 1 ? 'Coping' : s.anxietyScore === 2 ? 'Panicking' : 'N/A';
    const notes = s.notes ? `"${s.notes.replace(/"/g, '""')}"` : '';
    const exerciseLevel = s.exercisedLevel ?? '';
    const anybodyHome = s.anyoneHome ? `"${s.anyoneHome.replace(/"/g, '""')}"` : '';

    const maxDuration = s.steps.length > 0 ? Math.max(...s.steps.map(step => step.durationSeconds)) : 0;

    const stepDurations = Array.from({ length: 10 }, (_, i) => {
      return i < s.steps.length ? s.steps[i].durationSeconds : '';
    });

    return [
      format(new Date(s.date), 'yyyy-MM-dd HH:mm:ss'),
      s.totalDurationSeconds,
      maxDuration,
      completedSteps,
      s.steps.length,
      score,
      notes,
      exerciseLevel,
      anybodyHome,
      ...stepDurations
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
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
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  if (lines.length <= 1) return []; // Only headers or empty

  const sessions: Session[] = [];
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV parser handling quotes
    const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
    const matches = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match[1] !== undefined) {
        matches.push(match[1].replace(/""/g, '"'));
      } else {
        matches.push(match[2]);
      }
    }

    if (matches.length < 7) continue;

    const hasExtendedColumns = matches.length >= 19;

    const [
      dateStr, 
      totalDurationStr, 
      maxDurationStr, // We parse it but don't strictly need it for reconstruction
      completedStepsStr, 
      totalStepsStr, 
      scoreStr, 
      notesStr,
      ...restColumns
    ] = matches;

    const exerciseLevelStr = hasExtendedColumns ? restColumns[0] ?? '' : '';
    const anybodyHomeStr = hasExtendedColumns ? restColumns[1] ?? '' : '';
    const stepDurationStrs = hasExtendedColumns ? restColumns.slice(2) : restColumns;
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    const totalDurationSeconds = parseInt(totalDurationStr, 10) || 0;
    const totalSteps = parseInt(totalStepsStr, 10) || 1;
    const completedSteps = parseInt(completedStepsStr, 10) || 0;
    
    let anxietyScore: 0 | 1 | 2 | undefined = undefined;
    if (scoreStr === 'Calm') anxietyScore = 0;
    else if (scoreStr === 'Coping') anxietyScore = 1;
    else if (scoreStr === 'Panicking') anxietyScore = 2;

    let exercisedLevel: 0 | 1 | 2 | 3 | 4 | 5 | undefined = undefined;
    const parsedExerciseLevel = parseInt(exerciseLevelStr, 10);
    if (!isNaN(parsedExerciseLevel) && parsedExerciseLevel >= 0 && parsedExerciseLevel <= 5) {
      exercisedLevel = parsedExerciseLevel as 0 | 1 | 2 | 3 | 4 | 5;
    }

    const steps: Step[] = [];
    
    // Reconstruct steps from the 10 columns
    for (let j = 0; j < Math.min(totalSteps, 10); j++) {
      const durationStr = stepDurationStrs[j];
      let durationSeconds = parseInt(durationStr, 10);
      
      // Fallback if the column is empty or invalid but we expect a step
      if (isNaN(durationSeconds)) {
         durationSeconds = 0;
      }

      steps.push({
        id: crypto.randomUUID(),
        durationSeconds,
        completed: j < completedSteps
      });
    }

    // If there were more than 10 steps originally, we pad them with 0 duration
    // so the total count matches, though we lost their actual durations.
    for (let j = 10; j < totalSteps; j++) {
      steps.push({
        id: crypto.randomUUID(),
        durationSeconds: 0,
        completed: j < completedSteps
      });
    }

    sessions.push({
      id: crypto.randomUUID(),
      date: date.toISOString(),
      totalDurationSeconds,
      steps,
      anxietyScore,
      exercisedLevel,
      anyoneHome: anybodyHomeStr || '',
      notes: notesStr || '',
      completed: true
    });
  }

  return sessions;
}
