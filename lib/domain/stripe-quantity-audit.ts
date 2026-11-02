export const STRIPE_QUANTITY_DRIFT_EVENT = "billing.stripe_quantity_drift";
export const STRIPE_QUANTITY_DRIFT_RESOLVED_EVENT = "billing.stripe_quantity_drift_resolved";

export type StripeQuantityFinding = {
  customerId: string;
  customerName: string;
  /** Which TL record supplied the expected count. */
  source: "canonical" | "legacy";
  /** Canonical subscription id when `source` is canonical. */
  subscriptionId: string | null;
  stripeSubscriptionId: string;
  expectedQuantity: number;
  stripeQuantity: number;
  /** The existing one-click push would set Stripe to `expectedQuantity`. */
  pushSafe: boolean;
};

/** Latest drift / resolved event per customer, used to alert only on changes. */
export type PreviousDriftState = {
  category: string;
  signature: string | null;
};

export function driftSignature(finding: Pick<StripeQuantityFinding, "stripeSubscriptionId" | "expectedQuantity" | "stripeQuantity">): string {
  return `${finding.stripeSubscriptionId}:${finding.expectedQuantity}:${finding.stripeQuantity}`;
}

/**
 * A finding is new when the customer's last recorded state was not this exact drift.
 * A customer whose last state was a drift, and who has no finding tonight, is resolved.
 * Customers that could not be checked tonight are neither, so a Stripe outage never
 * clears an open drift.
 */
export function classifyStripeQuantityFindings(input: {
  findings: StripeQuantityFinding[];
  previous: Map<string, PreviousDriftState>;
  checkedCustomerIds: Set<string>;
}): { newOrChanged: StripeQuantityFinding[]; resolvedCustomerIds: string[] } {
  const findingCustomers = new Set(input.findings.map((finding) => finding.customerId));
  const newOrChanged = input.findings.filter((finding) => {
    const last = input.previous.get(finding.customerId);
    return !(last?.category === STRIPE_QUANTITY_DRIFT_EVENT && last.signature === driftSignature(finding));
  });
  const resolvedCustomerIds = [...input.previous.entries()]
    .filter(([customerId, last]) =>
      last.category === STRIPE_QUANTITY_DRIFT_EVENT
      && input.checkedCustomerIds.has(customerId)
      && !findingCustomers.has(customerId))
    .map(([customerId]) => customerId);
  return { newOrChanged, resolvedCustomerIds };
}

export function stripeQuantityReviewPath(finding: Pick<StripeQuantityFinding, "source" | "subscriptionId" | "customerId">): string {
  return finding.source === "canonical" && finding.subscriptionId
    ? `/admin/subscriptions/canonical/${finding.subscriptionId}`
    : `/admin/subscriptions/${finding.customerId}/renewals`;
}

const SMS_MAX_LINES = 5;

/** Staff SMS listing every open drift; new ones are marked so repeat alerts stay readable. */
export function buildStripeQuantityAlertSms(input: {
  findings: StripeQuantityFinding[];
  newCustomerIds: Set<string>;
  baseUrl: string;
}): string {
  const { findings, newCustomerIds, baseUrl } = input;
  const lines = findings.slice(0, SMS_MAX_LINES).map((finding) => {
    const tag = newCustomerIds.has(finding.customerId) ? "NEW " : "";
    return `${tag}${finding.customerName}: Stripe bills ${finding.stripeQuantity}, TL expects ${finding.expectedQuantity}\n${baseUrl}${stripeQuantityReviewPath(finding)}`;
  });
  const more = findings.length > SMS_MAX_LINES ? [`…and ${findings.length - SMS_MAX_LINES} more.`] : [];
  return [
    "AUTOMATED — TL Portal",
    "",
    `Stripe vehicle quantity differs for ${findings.length} customer${findings.length === 1 ? "" : "s"}:`,
    "",
    ...lines,
    ...more,
  ].join("\n");
}
