import type { Prisma, SubscriptionLifecycleStatus } from "@prisma/client";

/**
 * Helpers for the "Customer (New)" workspace (/admin/customer-new).
 * Kept separate from the existing customers page so the two never share behaviour.
 */

/** A subscription counts as "current" while it is running, waiting to start, or paused. */
export const CURRENT_SUBSCRIPTION_STATUSES: SubscriptionLifecycleStatus[] = [
  "active",
  "pending_activation",
  "paused",
];

export const currentSubscriptionWhere: Prisma.CustomerSubscriptionWhereInput = {
  controlMode: { not: "legacy" },
  lifecycleStatus: { in: CURRENT_SUBSCRIPTION_STATUSES },
};

export type CustomerNewFilter = "all" | "subscribed" | "none";

export const CUSTOMER_NEW_LIST_LIMIT = 300;

export function parseCustomerNewFilter(raw: string | undefined): CustomerNewFilter {
  return raw === "subscribed" || raw === "none" ? raw : "all";
}

export function customerNewHref(opts: { c?: string | null; q?: string; filter?: CustomerNewFilter }): string {
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  if (opts.filter && opts.filter !== "all") params.set("filter", opts.filter);
  if (opts.c) params.set("c", opts.c);
  const qs = params.toString();
  return qs ? `/admin/customer-new?${qs}` : "/admin/customer-new";
}

export function customerNewAddress(c: {
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}): string | null {
  const cityLine = [[c.city, c.state].filter(Boolean).join(", "), c.postalCode].filter(Boolean).join(" ");
  const parts = [c.address?.trim(), cityLine.trim(), c.country?.trim()].filter(Boolean) as string[];
  return parts.length ? parts.join("\n") : null;
}

export function customerNewBillingMethod(billingMode: string): string {
  return billingMode === "stripe_subscription" ? "Card autocharge" : "Manual invoice";
}

export function customerNewCollectionLabel(method: string | null): string {
  if (method === "stripe_autocharge") return "Card billing";
  if (method === "manual_invoice") return "Manual invoice";
  return "Not set";
}
