/** Add whole calendar months in UTC (noon) to avoid DST edge cases on date-only fields. */
export function addCalendarMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setUTCHours(12, 0, 0, 0);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(y, m + months, day, 12, 0, 0, 0));
}

export function formatAssignmentDateLabel(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function dateInputValueFromDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Parse `<input type="date">` value (YYYY-MM-DD) to UTC noon. */
export function parseAssignmentDateInput(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const d = new Date(`${trimmed}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
