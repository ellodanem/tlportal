const WORKSPACE_PATH = "/admin/subscriptions/canonical";

/**
 * Where "View subscriptions" goes for one customer, always in the new Subscriptions area.
 *
 * - One canonical subscription: its own page.
 * - Several: the Subscriptions list narrowed to this customer (by id, never by display name).
 * - None: the customer's legacy lifecycle page, which is the only place their records live.
 */
export function customerSubscriptionsPath(customerId: string, canonicalSubscriptionIds: readonly string[]): string {
  if (canonicalSubscriptionIds.length === 0) return `/admin/subscriptions/${customerId}`;
  if (canonicalSubscriptionIds.length === 1) return `${WORKSPACE_PATH}/${canonicalSubscriptionIds[0]}`;
  return `${WORKSPACE_PATH}?customer=${encodeURIComponent(customerId)}`;
}
