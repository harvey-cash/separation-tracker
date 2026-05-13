export function applySessionCalendarDate(previousIso: string, nextDateInput: string): string {
  const [yearStr, monthStr, dayStr] = nextDateInput.split('-');
  const year = Number.parseInt(yearStr ?? '', 10);
  const monthIndex = Number.parseInt(monthStr ?? '', 10) - 1;
  const day = Number.parseInt(dayStr ?? '', 10);

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    return previousIso;
  }

  const previous = new Date(previousIso);
  if (Number.isNaN(previous.getTime())) {
    const fallback = new Date(year, monthIndex, day, 12, 0, 0, 0);
    return fallback.toISOString();
  }

  const next = new Date(previous);
  next.setFullYear(year, monthIndex, day);
  return next.toISOString();
}
