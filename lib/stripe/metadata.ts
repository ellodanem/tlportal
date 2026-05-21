export type StripeBillingMetadata = {
  subscriptionId?: string;
  priceId?: string;
  currentPeriodEnd?: string;
  cancelAt?: string | null;
  checkoutSessionId?: string;
};

export function parseStripeBillingMetadata(raw: unknown): StripeBillingMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  return {
    subscriptionId: typeof o.subscriptionId === "string" ? o.subscriptionId : undefined,
    priceId: typeof o.priceId === "string" ? o.priceId : undefined,
    currentPeriodEnd: typeof o.currentPeriodEnd === "string" ? o.currentPeriodEnd : undefined,
    cancelAt:
      o.cancelAt === null ? null : typeof o.cancelAt === "string" ? o.cancelAt : undefined,
    checkoutSessionId: typeof o.checkoutSessionId === "string" ? o.checkoutSessionId : undefined,
  };
}

export function stripeMetadataFromSubscription(sub: {
  id: string;
  items?: { data?: { price?: { id?: string } | string }[] };
  current_period_end?: number;
  cancel_at?: number | null;
}): StripeBillingMetadata {
  const price = sub.items?.data?.[0]?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  return {
    subscriptionId: sub.id,
    priceId: priceId ?? undefined,
    currentPeriodEnd:
      sub.current_period_end != null
        ? new Date(sub.current_period_end * 1000).toISOString()
        : undefined,
    cancelAt: sub.cancel_at != null ? new Date(sub.cancel_at * 1000).toISOString() : null,
  };
}
