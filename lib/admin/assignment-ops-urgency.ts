import type { ServiceAssignmentStatus } from "@prisma/client";

const MS_PER_DAY = 86_400_000;

export type OpsUrgency = "overdue" | "due_soon" | "ok" | "unknown";

/**
 * Ops renewal urgency from nextDueDate (calendar days, local server timezone).
 * Does not use ServiceAssignment.status due_soon/overdue — those are not auto-maintained.
 */
export function opsUrgencyFromNextDueDate(nextDueDate: Date | null | undefined, now = new Date()): OpsUrgency {
  if (!nextDueDate) {
    return "unknown";
  }
  const due = new Date(nextDueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
  if (diffDays < 0) {
    return "overdue";
  }
  if (diffDays <= 7) {
    return "due_soon";
  }
  return "ok";
}

export function opsUrgencyRank(urgency: OpsUrgency): number {
  switch (urgency) {
    case "overdue":
      return 0;
    case "due_soon":
      return 1;
    case "ok":
      return 2;
    default:
      return 3;
  }
}

/** Display status for tables: prefer date-based urgency when nextDueDate is set (active assignments only). */
export function displayAssignmentOpsStatus(
  status: ServiceAssignmentStatus,
  nextDueDate: Date | null | undefined,
): ServiceAssignmentStatus | "due_soon" | "overdue" {
  if (status === "cancelled" || status === "suspended") {
    return status;
  }
  if (nextDueDate) {
    const u = opsUrgencyFromNextDueDate(nextDueDate);
    if (u === "overdue") {
      return "overdue";
    }
    if (u === "due_soon") {
      return "due_soon";
    }
    return "active";
  }
  return status;
}
