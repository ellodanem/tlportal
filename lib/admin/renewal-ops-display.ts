import { opsUrgencyFromNextDueDate, opsUrgencyRank, type OpsUrgency } from "@/lib/admin/assignment-ops-urgency";

export type RenewalOpsRowInput = {
  id: string;
  nextDueDate: string | null;
};

export type RenewalOpsCounts = {
  total: number;
  overdue: number;
  dueSoon: number;
  ok: number;
  unknown: number;
};

export function renewalRowUrgency(nextDueDate: string | null): OpsUrgency {
  return opsUrgencyFromNextDueDate(nextDueDate ? new Date(nextDueDate) : null);
}

export function countRenewalOps(rows: RenewalOpsRowInput[]): RenewalOpsCounts {
  const counts: RenewalOpsCounts = {
    total: rows.length,
    overdue: 0,
    dueSoon: 0,
    ok: 0,
    unknown: 0,
  };
  for (const row of rows) {
    const u = renewalRowUrgency(row.nextDueDate);
    if (u === "overdue") counts.overdue += 1;
    else if (u === "due_soon") counts.dueSoon += 1;
    else if (u === "ok") counts.ok += 1;
    else counts.unknown += 1;
  }
  return counts;
}

export function sortRenewalRowsByUrgency<T extends RenewalOpsRowInput>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = opsUrgencyRank(renewalRowUrgency(a.nextDueDate));
    const rb = opsUrgencyRank(renewalRowUrgency(b.nextDueDate));
    if (ra !== rb) return ra - rb;
    const da = a.nextDueDate ? new Date(a.nextDueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.nextDueDate ? new Date(b.nextDueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return da - db;
  });
}

export function priorityRenewalRows<T extends RenewalOpsRowInput>(rows: T[], max = 5): T[] {
  const urgent = sortRenewalRowsByUrgency(rows).filter((r) => {
    const u = renewalRowUrgency(r.nextDueDate);
    return u === "overdue" || u === "due_soon";
  });
  return urgent.slice(0, max);
}

export function renewalOpsSummaryLabel(counts: RenewalOpsCounts): string {
  const parts: string[] = [`${counts.total} active`];
  if (counts.overdue > 0) {
    parts.push(`${counts.overdue} overdue`);
  }
  if (counts.dueSoon > 0) {
    parts.push(`${counts.dueSoon} due soon`);
  }
  return parts.join(" · ");
}
