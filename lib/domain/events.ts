/** TL-native operational event categories (stored as strings in DB). */
export const OPERATIONAL_EVENT_CATEGORIES = [
  "assignment.created",
  "assignment.ended",
  "device.registered",
  "sim.imported",
  "sim.linked",
  "billing.synced",
  "billing.checkout_recovery_sent",
  "billing.payment_failed",
  "billing.payment_decline_email_resent",
  "billing.mode_changed",
  "gps.link.updated",
  "registration.approved",
  "registration.rejected",
  "staff.note",
  "broadcast.sent",
  "broadcast.completed",
  "customer.archived",
  "customer.unarchived",
] as const;

export type OperationalEventCategory = (typeof OPERATIONAL_EVENT_CATEGORIES)[number];

export function isOperationalEventCategory(value: string): value is OperationalEventCategory {
  return (OPERATIONAL_EVENT_CATEGORIES as readonly string[]).includes(value);
}
