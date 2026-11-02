/**
 * Route map and visibility rules for a canonical subscription's detail area.
 *
 * Every section is a real, linkable route. There are no collapsed sections and no in-page
 * anchors, so a link can never point at hidden content.
 */

export type SubscriptionTabKey = "services" | "billing" | "invoices" | "activity" | "advanced";

export type SubscriptionTab = {
  key: SubscriptionTabKey;
  label: string;
  /** Route segment under the subscription. */
  segment: string;
  href: string;
};

export function subscriptionBasePath(subscriptionId: string): string {
  return `/admin/subscriptions/canonical/${subscriptionId}`;
}

export function subscriptionServicePath(subscriptionId: string, itemId: string): string {
  return `${subscriptionBasePath(subscriptionId)}/services/${itemId}`;
}

/** The single entry point for adding a service, for both draft and active subscriptions. */
export function subscriptionAddServicePath(subscriptionId: string): string {
  return `${subscriptionBasePath(subscriptionId)}/add-service`;
}

export function subscriptionAnnualAdjustmentPath(subscriptionId: string): string {
  return `${subscriptionBasePath(subscriptionId)}/billing/annual-adjustment`;
}

export function subscriptionAdvancedPath(subscriptionId: string): string {
  return `${subscriptionBasePath(subscriptionId)}/advanced`;
}

export type AdvancedFacts = {
  controlMode: string;
  collectionMethod: string | null;
  providerLinkCount: number;
  billingOperationCount: number;
  migrationSourceKind: string | null;
};

export type AdvancedSections = {
  provider: boolean;
  stripeAdoption: boolean;
  pilotTransfer: boolean;
  any: boolean;
};

/**
 * Staff-only destinations are offered only when they are relevant. Manual-invoice customers
 * with no provider history never see provider or adoption pages.
 */
export function advancedSectionsFor(facts: AdvancedFacts): AdvancedSections {
  const provider = facts.collectionMethod === "stripe_autocharge" || facts.providerLinkCount > 0 || facts.billingOperationCount > 0;
  const stripeAdoption = facts.controlMode === "shadow" && facts.collectionMethod === "stripe_autocharge";
  const pilotTransfer = facts.migrationSourceKind === "manual_schedule" || facts.migrationSourceKind === "manual_invoice";
  return { provider, stripeAdoption, pilotTransfer, any: provider || stripeAdoption || pilotTransfer };
}

export function subscriptionTabs(subscriptionId: string, options: { showAdvanced: boolean }): SubscriptionTab[] {
  const base = subscriptionBasePath(subscriptionId);
  const tabs: SubscriptionTab[] = [
    { key: "services", label: "Services", segment: "services", href: `${base}/services` },
    { key: "billing", label: "Billing & renewal", segment: "billing", href: `${base}/billing` },
    { key: "invoices", label: "Invoices & payments", segment: "invoices", href: `${base}/invoices` },
    { key: "activity", label: "Activity", segment: "activity", href: `${base}/activity` },
  ];
  if (options.showAdvanced) tabs.push({ key: "advanced", label: "Advanced", segment: "advanced", href: `${base}/advanced` });
  return tabs;
}

/** Maps the first child segment under the subscription layout to its tab. */
export function activeSubscriptionTab(segment: string | null | undefined): SubscriptionTabKey {
  switch (segment) {
    case "services": return "services";
    case "billing": return "billing";
    case "invoices": return "invoices";
    case "activity": return "activity";
    case "advanced": return "advanced";
    // The subscription index redirects to Services, which is also where add-service returns to.
    default: return "services";
  }
}

/** Lifecycle outcomes a staff member may choose from each lifecycle state (confirm-only, never inline). */
export const SUBSCRIPTION_LIFECYCLE_ACTIONS: Record<string, readonly { value: "active" | "paused" | "ended" | "canceled"; label: string }[]> = {
  pending_activation: [{ value: "active", label: "Mark active" }, { value: "canceled", label: "Cancel agreement" }],
  active: [{ value: "paused", label: "Pause agreement" }, { value: "ended", label: "End agreement" }, { value: "canceled", label: "Cancel agreement" }],
  paused: [{ value: "active", label: "Resume agreement" }, { value: "ended", label: "End agreement" }, { value: "canceled", label: "Cancel agreement" }],
};
