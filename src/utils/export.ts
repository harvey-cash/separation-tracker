import { Session } from '../types';
import { format } from 'date-fns';

export function exportToCSV(sessions: Session[]) {
  const headers = ['Date', 'Total Duration (s)', 'Completed Steps', 'Total Steps', 'Anxiety Score', 'Notes'];
  
  const rows = sessions.map(s => {
    const completedSteps = s.steps.filter(step => step.completed).length;
    const score = s.anxietyScore === 0 ? 'Calm' : s.anxietyScore === 1 ? 'Coping' : s.anxietyScore === 2 ? 'Panicking' : 'N/A';
    const notes = s.notes ? `"${s.notes.replace(/"/g, '""')}"` : '';
    
    return [
      format(new Date(s.date), 'yyyy-MM-dd HH:mm:ss'),
      s.totalDurationSeconds,
      completedSteps,
      s.steps.length,
      score,
      notes
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `csa_sessions_${format(new Date(), 'yyyyMMdd')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToHTML(sessions: Session[]) {
  const rows = sessions.map(s => {
    const completedSteps = s.steps.filter(step => step.completed).length;
    const score = s.anxietyScore === 0 ? 'Calm' : s.anxietyScore === 1 ? 'Coping' : s.anxietyScore === 2 ? 'Panicking' : 'N/A';
    
    return `
      <tr>
        <td>${format(new Date(s.date), 'yyyy-MM-dd HH:mm')}</td>
        <td>${s.totalDurationSeconds}s</td>
        <td>${completedSteps} / ${s.steps.length}</td>
        <td>${score}</td>
        <td>${s.notes || ''}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>CSA Tracker Export</title>
      <style>
        body { font-family: sans-serif; padding: 2rem; color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f4f4f4; }
      </style>
    </head>
    <body>
      <h1>Canine Separation Anxiety Tracker - Export</h1>
      <p>Generated on ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Total Duration</th>
            <th>Steps Completed</th>
            <th>Anxiety Score</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `csa_sessions_${format(new Date(), 'yyyyMMdd')}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
