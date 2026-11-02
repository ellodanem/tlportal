export type QuantityCheckItem = {
  status: string;
  billingEffectiveFrom: Date | null;
  billingEffectiveUntil: Date | null;
};

export type QuantityCheckSync = {
  state: "in_sync" | "differs" | "unavailable";
  reason: string | null;
  canPush: boolean;
  tlVehicleCount: number;
  stripeQuantity: number | null;
  stripeSubscriptionId: string | null;
};

export type CanonicalStripeQuantityCheck =
  | { state: "in_sync"; serviceCount: number; stripeQuantity: number }
  | {
      state: "differs";
      serviceCount: number;
      stripeQuantity: number;
      /** Devices the one-click push would send to Stripe. */
      deviceCount: number;
      /** True only when the push would set Stripe to exactly the billable service count. */
      pushMatchesServices: boolean;
    }
  | { state: "unavailable"; serviceCount: number; reason: string };

/** Services that will be charged on the next renewal (same rule as the recurring total). Paused services are not. */
export function billableServiceCountAtRenewal(items: QuantityCheckItem[], nextBillingDate: Date | null): number {
  if (!nextBillingDate) return 0;
  return items.filter((item) => {
    if (item.status === "ended" || item.status === "canceled" || item.status === "paused") return false;
    if (!item.billingEffectiveFrom || item.billingEffectiveFrom > nextBillingDate) return false;
    if (item.billingEffectiveUntil && item.billingEffectiveUntil <= nextBillingDate) return false;
    return true;
  }).length;
}

/**
 * Compare Stripe's subscription quantity with the canonical subscription's billable services.
 * The customer-level sync resolves Stripe on its own, so it is only trusted when it read the
 * same Stripe subscription this agreement is linked to.
 */
export function evaluateCanonicalStripeQuantity(input: {
  serviceCount: number;
  linkedExternalSubscriptionId: string | null;
  sync: QuantityCheckSync;
}): CanonicalStripeQuantityCheck {
  const { serviceCount, linkedExternalSubscriptionId, sync } = input;
  if (!linkedExternalSubscriptionId) {
    return { state: "unavailable", serviceCount, reason: "No Stripe subscription is linked to this agreement." };
  }
  if (sync.stripeSubscriptionId && sync.stripeSubscriptionId !== linkedExternalSubscriptionId) {
    return {
      state: "unavailable",
      serviceCount,
      reason: `The customer's card billing points at a different Stripe subscription (${sync.stripeSubscriptionId}) than this agreement (${linkedExternalSubscriptionId}).`,
    };
  }
  if (sync.stripeQuantity == null) {
    return { state: "unavailable", serviceCount, reason: sync.reason ?? "Could not read the Stripe quantity." };
  }
  if (sync.stripeQuantity === serviceCount) {
    return { state: "in_sync", serviceCount, stripeQuantity: sync.stripeQuantity };
  }
  return {
    state: "differs",
    serviceCount,
    stripeQuantity: sync.stripeQuantity,
    deviceCount: sync.tlVehicleCount,
    pushMatchesServices: sync.state === "differs" && sync.canPush && sync.tlVehicleCount === serviceCount,
  };
}
