const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Current calendar date in Atlantic (St Lucia, UTC−4, no DST). */
export function atlanticTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/St_Lucia" }).format(new Date());
}

export function atlanticTomorrowYmd(): string {
  return addDaysToYmd(atlanticTodayYmd(), 1);
}

export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0, 0));
  return utc.toISOString().slice(0, 10);
}

/** Midnight on the given Atlantic calendar day, stored as UTC. */
export function sendAtFromAtlanticDateYmd(ymd: string): Date | { error: string } {
  if (!YMD_RE.test(ymd)) {
    return { error: "Invalid date." };
  }
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) {
    return { error: "Invalid date." };
  }
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0));
}

export function parseScheduledSendDateInput(raw: string): Date | { error: string } {
  const ymd = raw.trim();
  const sendAt = sendAtFromAtlanticDateYmd(ymd);
  if ("error" in sendAt) {
    return sendAt;
  }
  const today = atlanticTodayYmd();
  if (ymd < today) {
    return { error: "Choose today or a future date." };
  }
  return sendAt;
}

export function formatScheduledSendLabel(sendAt: Date): string {
  return sendAt.toLocaleDateString("en-029", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/St_Lucia",
  });
}
