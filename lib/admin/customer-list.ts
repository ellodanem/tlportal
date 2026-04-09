import type { ServiceAssignmentStatus } from "@prisma/client";

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
  assignments: { status: ServiceAssignmentStatus }[],
): AssignmentRollup {
  if (assignments.length === 0) return "none";
  const set = new Set(assignments.map((a) => a.status));
  if (set.has("overdue")) return "overdue";
  if (set.has("due_soon")) return "due_soon";
  if (set.has("suspended")) return "suspended";
  return "active";
}

export function earliestNextDue(assignments: { nextDueDate: Date | null }[]): Date | null {
  const times = assignments
    .map((a) => a.nextDueDate)
    .filter((d): d is Date => d != null)
    .map((d) => d.getTime());
  if (times.length === 0) return null;
  return new Date(Math.min(...times));
}
