import "server-only";

import { getBillingAlertSmsRecipients } from "@/lib/billing/billing-alert-phones";
import { prisma } from "@/lib/db";
import {
  billableServiceCountAtRenewal,
  evaluateCanonicalStripeQuantity,
} from "@/lib/domain/canonical-stripe-quantity-check";
import {
  buildStripeQuantityAlertSms,
  classifyStripeQuantityFindings,
  driftSignature,
  STRIPE_QUANTITY_DRIFT_EVENT,
  STRIPE_QUANTITY_DRIFT_RESOLVED_EVENT,
  type PreviousDriftState,
  type StripeQuantityFinding,
} from "@/lib/domain/stripe-quantity-audit";
import { recordOperationalEvent } from "@/lib/services/operational-event-service";
import { compareTlStripeSubscription } from "@/lib/services/stripe-subscription-sync-service";
import { getAppBaseUrl } from "@/lib/stripe/app-url";
import { isStripeBillingEnabled } from "@/lib/stripe/config";
import { sendTwilioAdminSms } from "@/lib/twilio/admin-sms";

export type StripeQuantityAuditResult = {
  ok: boolean;
  dryRun: boolean;
  customersChecked: number;
  findings: StripeQuantityFinding[];
  newOrChanged: number;
  resolved: number;
  unchecked: { customerId: string; reason: string }[];
  smsSent: number;
  smsErrors: string[];
  error?: string;
};

function displayName(customer: { company: string | null; firstName: string | null; lastName: string | null }): string {
  return customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Customer";
}

async function latestDriftStateByCustomer(customerIds: string[]): Promise<Map<string, PreviousDriftState>> {
  const events = await prisma.operationalEvent.findMany({
    where: {
      customerId: { in: customerIds },
      category: { in: [STRIPE_QUANTITY_DRIFT_EVENT, STRIPE_QUANTITY_DRIFT_RESOLVED_EVENT] },
    },
    orderBy: { occurredAt: "desc" },
    select: { customerId: true, category: true, payload: true },
  });
  const latest = new Map<string, PreviousDriftState>();
  for (const event of events) {
    if (!event.customerId || latest.has(event.customerId)) continue;
    const payload = event.payload as { signature?: unknown } | null;
    latest.set(event.customerId, {
      category: event.category,
      signature: typeof payload?.signature === "string" ? payload.signature : null,
    });
  }
  return latest;
}

/**
 * Nightly read of every Stripe card-billing customer: Stripe subscription quantity versus the
 * count TL expects (billable canonical services when the customer has a canonical Stripe
 * agreement, otherwise active devices on the Stripe plan term). Never changes Stripe.
 * Records one event per new, changed or resolved drift and texts staff only when something
 * is new or changed.
 */
export async function runStripeQuantityAudit(options: { dryRun?: boolean } = {}): Promise<StripeQuantityAuditResult> {
  const dryRun = Boolean(options.dryRun);
  const empty: StripeQuantityAuditResult = {
    ok: true, dryRun, customersChecked: 0, findings: [], newOrChanged: 0, resolved: 0, unchecked: [], smsSent: 0, smsErrors: [],
  };
  if (!isStripeBillingEnabled()) {
    return { ...empty, ok: false, error: "Stripe billing is not configured." };
  }

  const customers = await prisma.customer.findMany({
    where: { billingMode: "stripe_subscription", archivedAt: null },
    orderBy: { id: "asc" },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      customerSubscriptions: {
        where: { controlMode: "canonical", collectionMethod: "stripe_autocharge", lifecycleStatus: "active" },
        select: {
          id: true,
          nextBillingDate: true,
          items: { select: { status: true, billingEffectiveFrom: true, billingEffectiveUntil: true } },
          providerLinks: { where: { provider: "stripe", endedAt: null }, select: { externalSubscriptionId: true } },
        },
      },
    },
  });

  const findings: StripeQuantityFinding[] = [];
  const unchecked: { customerId: string; reason: string }[] = [];
  const checked = new Set<string>();

  for (const customer of customers) {
    const customerName = displayName(customer);
    let sync: Awaited<ReturnType<typeof compareTlStripeSubscription>>;
    try {
      sync = await compareTlStripeSubscription(customer.id);
    } catch (error) {
      unchecked.push({ customerId: customer.id, reason: error instanceof Error ? error.message : "Stripe comparison failed." });
      continue;
    }

    if (customer.customerSubscriptions.length > 0) {
      let customerChecked = false;
      for (const subscription of customer.customerSubscriptions) {
        const check = evaluateCanonicalStripeQuantity({
          serviceCount: billableServiceCountAtRenewal(subscription.items, subscription.nextBillingDate),
          linkedExternalSubscriptionId: subscription.providerLinks[0]?.externalSubscriptionId ?? null,
          sync,
        });
        if (check.state === "unavailable") {
          unchecked.push({ customerId: customer.id, reason: check.reason });
          continue;
        }
        customerChecked = true;
        if (check.state === "differs" && sync.stripeSubscriptionId) {
          findings.push({
            customerId: customer.id,
            customerName,
            source: "canonical",
            subscriptionId: subscription.id,
            stripeSubscriptionId: sync.stripeSubscriptionId,
            expectedQuantity: check.serviceCount,
            stripeQuantity: check.stripeQuantity,
            pushSafe: check.pushMatchesServices,
          });
        }
      }
      if (customerChecked) checked.add(customer.id);
      continue;
    }

    if (sync.stripeQuantity == null || !sync.stripeSubscriptionId) {
      unchecked.push({ customerId: customer.id, reason: sync.reason ?? "Stripe quantity unavailable." });
      continue;
    }
    checked.add(customer.id);
    if (sync.stripeQuantity !== sync.tlVehicleCount) {
      findings.push({
        customerId: customer.id,
        customerName,
        source: "legacy",
        subscriptionId: null,
        stripeSubscriptionId: sync.stripeSubscriptionId,
        expectedQuantity: sync.tlVehicleCount,
        stripeQuantity: sync.stripeQuantity,
        pushSafe: sync.canPush,
      });
    }
  }

  const previous = await latestDriftStateByCustomer(customers.map((customer) => customer.id));
  const { newOrChanged, resolvedCustomerIds } = classifyStripeQuantityFindings({ findings, previous, checkedCustomerIds: checked });
  const result: StripeQuantityAuditResult = {
    ...empty,
    customersChecked: checked.size,
    findings,
    newOrChanged: newOrChanged.length,
    resolved: resolvedCustomerIds.length,
    unchecked,
  };
  if (dryRun) return result;

  for (const finding of newOrChanged) {
    await recordOperationalEvent({
      category: STRIPE_QUANTITY_DRIFT_EVENT,
      summary: `Nightly check: Stripe bills ${finding.stripeQuantity} vehicle${finding.stripeQuantity === 1 ? "" : "s"}, TL expects ${finding.expectedQuantity}`,
      customerId: finding.customerId,
      payload: { ...finding, signature: driftSignature(finding) },
    });
  }
  for (const customerId of resolvedCustomerIds) {
    await recordOperationalEvent({
      category: STRIPE_QUANTITY_DRIFT_RESOLVED_EVENT,
      summary: "Nightly check: Stripe vehicle quantity matches TL again",
      customerId,
    });
  }

  if (newOrChanged.length > 0) {
    const recipients = await getBillingAlertSmsRecipients();
    const body = buildStripeQuantityAlertSms({
      findings,
      newCustomerIds: new Set(newOrChanged.map((finding) => finding.customerId)),
      baseUrl: getAppBaseUrl(),
    });
    for (const to of recipients) {
      const sent = await sendTwilioAdminSms(to, body);
      if (sent.ok) result.smsSent += 1;
      else result.smsErrors.push(`${to}: ${sent.error}`);
    }
    if (recipients.length === 0) result.smsErrors.push("no_admin_phones");
  }

  return result;
}
