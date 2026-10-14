export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Preserve the existing recurring cadence behavior based on UTC calendar months. */
export function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function recurringGenerationKey(scheduleId: string, issueDate: Date): string {
  return `${scheduleId}:${startOfUtcDay(issueDate).toISOString()}`;
}

/** Advance a schedule without allowing a forced/retried period to move it backwards. */
export function nextRecurringScheduleDate(
  current: Date,
  issueDate: Date,
  intervalMonths: number,
): Date {
  const candidate = addUtcMonths(issueDate, intervalMonths);
  return current > candidate ? new Date(current) : candidate;
}
