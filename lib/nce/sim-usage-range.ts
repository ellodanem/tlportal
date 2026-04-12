/** Max inclusive calendar days 1NCE usage queries should span (aligned with ~6 month API limit). */
export const SIM_USAGE_RANGE_MAX_SPAN_DAYS = 183;

/**
 * Default window when no query params: `end` = today (UTC calendar), `start` = today − 180 calendar days
 * (same as the previous fixed window — inclusive span is 181 UTC calendar days).
 */
const DEFAULT_BACK_CALENDAR_DAYS = 180;

function parseYmdUtc(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const t = Date.parse(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t);
}

export function formatYmdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today as UTC calendar date at noon (stable for comparisons and 1NCE date strings). */
export function utcCalendarToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12, 0, 0, 0));
}

export function addUtcCalendarDays(d: Date, delta: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + delta);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), 12, 0, 0, 0));
}

export type ResolvedSimUsageRange = {
  start: Date;
  end: Date;
  usageFrom: string;
  usageTo: string;
  /** True when both `usageFrom` and `usageTo` query params were present and parsed (before clamp). */
  usedQueryParams: boolean;
};

/**
 * Resolve inclusive [start, end] for 1NCE usage from URL search params.
 * - Missing or invalid params → default last ~180 UTC calendar days through today.
 * - Swaps if from > to.
 * - Clamps span to SIM_USAGE_RANGE_MAX_SPAN_DAYS (keeps the more recent window).
 * - Clamps end to today (UTC) if in the future.
 */
export function defaultSimUsageRangeQuery(): { usageFrom: string; usageTo: string; start: Date; end: Date } {
  const end = utcCalendarToday();
  const start = addUtcCalendarDays(end, -DEFAULT_BACK_CALENDAR_DAYS);
  return {
    start,
    end,
    usageFrom: formatYmdUtc(start),
    usageTo: formatYmdUtc(end),
  };
}

export function resolveSimUsageRangeFromQuery(q: {
  usageFrom?: string;
  usageTo?: string;
}): ResolvedSimUsageRange {
  const today = utcCalendarToday();
  const def = defaultSimUsageRangeQuery();

  const fromIn = q.usageFrom?.trim();
  const toIn = q.usageTo?.trim();

  if (!fromIn || !toIn) {
    return {
      start: def.start,
      end: def.end,
      usageFrom: def.usageFrom,
      usageTo: def.usageTo,
      usedQueryParams: false,
    };
  }

  let start = parseYmdUtc(fromIn);
  let end = parseYmdUtc(toIn);
  if (!start || !end) {
    return {
      start: def.start,
      end: def.end,
      usageFrom: def.usageFrom,
      usageTo: def.usageTo,
      usedQueryParams: false,
    };
  }

  let usedQueryParams = true;
  if (start.getTime() > end.getTime()) {
    const t = start;
    start = end;
    end = t;
  }

  if (end.getTime() > today.getTime()) {
    end = today;
  }
  if (start.getTime() > end.getTime()) {
    start = addUtcCalendarDays(end, -(SIM_USAGE_RANGE_MAX_SPAN_DAYS - 1));
  }

  const spanDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (spanDays > SIM_USAGE_RANGE_MAX_SPAN_DAYS) {
    start = addUtcCalendarDays(end, -(SIM_USAGE_RANGE_MAX_SPAN_DAYS - 1));
  }

  return {
    start,
    end,
    usageFrom: formatYmdUtc(start),
    usageTo: formatYmdUtc(end),
    usedQueryParams,
  };
}

export function buildSimUsageRangeHref(simId: string, usageFrom: string, usageTo: string): string {
  const qs = new URLSearchParams({ usageFrom, usageTo }).toString();
  return `/admin/sims/${encodeURIComponent(simId)}?${qs}`;
}

/** Inclusive last N calendar days ending today (UTC): [today-(N-1), today]. */
export function presetInclusiveDaysEndingToday(days: number): { usageFrom: string; usageTo: string } {
  const end = utcCalendarToday();
  const start = addUtcCalendarDays(end, -(Math.min(days, SIM_USAGE_RANGE_MAX_SPAN_DAYS) - 1));
  return { usageFrom: formatYmdUtc(start), usageTo: formatYmdUtc(end) };
}
