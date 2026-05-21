import type { ServiceAssignmentStatus } from "@prisma/client";

import { displayAssignmentOpsStatus } from "@/lib/admin/assignment-ops-urgency";

export type AssignmentRollup = "overdue" | "due_soon" | "suspended" | "active" | "none";

export function customerDisplayName(c: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  const co = c.company?.trim();
  if (co) return co;
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return person || "Customer";
}

export function customerInitials(c: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  const co = c.company?.trim();
  if (co) {
    const parts = co.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return co.slice(0, 2).toUpperCase();
  }
  const a = c.firstName?.[0] ?? "";
  const b = c.lastName?.[0] ?? "";
  const out = `${a}${b}`.toUpperCase();
  return out || "?";
}

export function tagsPreview(tags: string[], max = 2): string | null {
  if (!tags.length) return null;
  const shown = tags.slice(0, max).join(", ");
  const more = tags.length > max ? ` +${tags.length - max}` : "";
  return `${shown}${more}`;
}

export function rollupFromAssignments(
  assignments: { status: ServiceAssignmentStatus; nextDueDate: Date | null }[],
): AssignmentRollup {
  if (assignments.length === 0) return "none";

  let rollup: AssignmentRollup = "active";
  for (const a of assignments) {
    const display = displayAssignmentOpsStatus(a.status, a.nextDueDate);
    if (display === "overdue") return "overdue";
    if (display === "due_soon") rollup = "due_soon";
    else if (display === "suspended" && rollup === "active") rollup = "suspended";
  }
  return rollup;
}

export function earliestNextDue(assignments: { nextDueDate: Date | null }[]): Date | null {
  const times = assignments
    .map((a) => a.nextDueDate)
    .filter((d): d is Date => d != null)
    .map((d) => d.getTime());
  if (times.length === 0) return null;
  return new Date(Math.min(...times));
}
