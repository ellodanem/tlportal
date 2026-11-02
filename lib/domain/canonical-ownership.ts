/**
 * Pure rules for deciding when billing data is owned by a canonical subscription.
 * Legacy editors (recurring schedule editor, billing mode, legacy subscription creation)
 * must consult these before mutating, so canonical billing authority is never rewritten
 * and no unlinked duplicate schedule is created for the same obligation.
 */

export const CANONICAL_SCHEDULE_OWNED_ERROR =
  "This recurring schedule is managed by a canonical subscription. Change cadence, services or status from the subscription's Billing tab instead.";

export const CANONICAL_CUSTOMER_OWNED_ERROR =
  "This customer already has a canonical subscription. Manage billing there, or create another agreement with New subscription.";

export type ScheduleOwnershipFacts = {
  customerSubscription?: { controlMode: string | null } | null;
};

/** A schedule linked to a canonical-controlled subscription is derived from that agreement. */
export function isCanonicalOwnedSchedule(schedule: ScheduleOwnershipFacts | null | undefined): boolean {
  return schedule?.customerSubscription?.controlMode === "canonical";
}

export type CustomerSubscriptionFacts = { controlMode: string | null; lifecycleStatus: string | null };

const TERMINAL_LIFECYCLE = new Set(["canceled", "ended"]);

/** True when any current (non-terminal) canonical agreement exists for the customer. */
export function customerHasCanonicalAuthority(subscriptions: readonly CustomerSubscriptionFacts[]): boolean {
  return subscriptions.some(
    (subscription) => subscription.controlMode === "canonical" && !TERMINAL_LIFECYCLE.has(subscription.lifecycleStatus ?? ""),
  );
}
