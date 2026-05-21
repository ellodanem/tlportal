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
