import { hasAssetLossNote } from "@/lib/domain/asset-loss";

/**
 * One rule for "is this service still part of what the customer is billed for?".
 *
 * A service's stored `status` stays `active` after its billing end date passes (asset lost, vehicle
 * sold, scheduled end); nothing flips it. So "ended" is derived: closed by status, or the billing end
 * date is today or earlier. This matches the half-open [from, until) window the billing resolver
 * uses, where the end date is the first day that is no longer billed.
 *
 * Display only: it never changes billing.
 */
export type ServiceLifecycleItem = {
  status: string;
  billingEffectiveUntil: Date | null;
};

const CLOSED_STATUSES = ["ended", "canceled"];
const DAY_MS = 86_400_000;

function utcDay(value: Date): number {
  return Math.floor(value.getTime() / DAY_MS);
}

export function isServiceBillingEnded(item: ServiceLifecycleItem, now: Date = new Date()): boolean {
  if (CLOSED_STATUSES.includes(item.status)) return true;
  return item.billingEffectiveUntil != null && utcDay(item.billingEffectiveUntil) <= utcDay(now);
}

/** Splits services into those still billable (including paused and future-dated ends) and ended ones. */
export function partitionServicesByBilling<T extends ServiceLifecycleItem>(
  items: readonly T[],
  now: Date = new Date(),
): { current: T[]; ended: T[] } {
  const current: T[] = [];
  const ended: T[] = [];
  for (const item of items) (isServiceBillingEnded(item, now) ? ended : current).push(item);
  return { current, ended };
}

export type EndedServiceReason = "asset_lost" | "vehicle_sold" | "ended";

export const ENDED_SERVICE_REASON_LABEL: Record<EndedServiceReason, string> = {
  asset_lost: "Asset lost",
  vehicle_sold: "Vehicle sold",
  ended: "Service ended",
};

/** Why a service ended, read from the notes the loss / vehicle-sale workflows leave on its hardware. */
export function endedServiceReason(item: {
  serviceAssignments: readonly { notes: string | null; pauseNote: string | null }[];
}): EndedServiceReason {
  if (item.serviceAssignments.some((assignment) => hasAssetLossNote(assignment.notes))) return "asset_lost";
  if (item.serviceAssignments.some((assignment) => assignment.pauseNote?.startsWith("Vehicle sold"))) return "vehicle_sold";
  return "ended";
}

/**
 * A service the customer is being billed for right now: not ended, and not paused. Paused services
 * stay on the subscription but drop out of the next renewal, so counts shown beside the recurring
 * total and the Stripe quantity leave them out, exactly as the total does.
 */
export function isServiceBilling(item: ServiceLifecycleItem, now: Date = new Date()): boolean {
  return item.status !== "paused" && !isServiceBillingEnded(item, now);
}

/** Count of services being billed; the number shown beside "Billable services". */
export function countBillableServices(items: readonly ServiceLifecycleItem[], now: Date = new Date()): number {
  return items.filter((item) => isServiceBilling(item, now)).length;
}

/**
 * Service count for a subscription row in lists. A subscription that has itself ended keeps its
 * full historical count; a current one counts only services being billed.
 */
export function subscriptionServiceCount(
  subscription: { lifecycleStatus: string | null; items: readonly ServiceLifecycleItem[] },
  now: Date = new Date(),
): number {
  if (subscription.lifecycleStatus === "ended" || subscription.lifecycleStatus === "canceled") {
    return subscription.items.length;
  }
  return countBillableServices(subscription.items, now);
}