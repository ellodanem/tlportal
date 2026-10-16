import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Prisma } from "@prisma/client";

import {
  assertCanonicalStripeExecutionEnabled,
  assertCanonicalStripeOperationApproval,
  buildCanonicalStripeOperationProposal,
  canonicalStripeProviderStateFingerprint,
  CanonicalStripeExecutionError,
} from "../lib/domain/canonical-stripe-execution";
import {
  buildCanonicalStripeRateGroups,
  type CanonicalStripeConfigurationInput,
  type LocalStripeProviderLink,
  type ObservedStripeSubscription,
} from "../lib/domain/canonical-stripe-shadow";

function configuration(input: {
  id?: string;
  lifecycle?: "pending_activation" | "active";
  controlMode?: "legacy" | "shadow" | "canonical";
  interval?: 1 | 3 | 6 | 12;
  amounts?: { id: string; amount: string; classification?: "standard" | "negotiated" }[];
} = {}): CanonicalStripeConfigurationInput {
  const interval = input.interval ?? 1;
  return {
    id: input.id ?? "subscription-1",
    customerId: "customer-1",
    controlMode: input.controlMode ?? "canonical",
    collectionMethod: "stripe_autocharge",
    lifecycleStatus: input.lifecycle ?? "active",
    billingIntervalMonths: interval,
    currency: "XCD",
    billingAnchorDate: new Date("2026-01-01T00:00:00.000Z"),
    nextBillingDate: new Date(interval === 12 ? "2027-01-01T00:00:00.000Z" : "2026-11-01T00:00:00.000Z"),
    items: (input.amounts ?? [
      { id: "service-a", amount: "25.00" },
      { id: "service-b", amount: "25.00" },
      { id: "service-c", amount: "20.00", classification: "negotiated" },
    ]).map((entry) => ({
      id: entry.id,
      label: entry.id,
      status: input.lifecycle === "pending_activation" ? "pending_activation" : "active",
      billingEffectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      billingEffectiveUntil: null,
      rates: [{
        id: `rate-${entry.id}`,
        billingIntervalMonths: interval,
        agreedAmountPerCycle: new Prisma.Decimal(entry.amount),
        currency: "XCD",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveUntil: null,
        classification: entry.classification ?? "standard",
      }],
    })),
  };
}

function linkedProvider(config = configuration()) {
  const expected = buildCanonicalStripeRateGroups(config, config.nextBillingDate!, { requireActive: false });
  const providerItems = expected.groups.map((group, index) => ({
    id: `mapping-${index}`,
    subscriptionProviderLinkId: "link-1",
    externalSubscriptionItemId: `si-${index}`,
    externalPriceId: `price-${index}`,
    currency: group.currency,
    billingIntervalMonths: group.billingIntervalMonths,
    agreedAmountPerCycle: group.agreedAmountPerCycle,
    quantity: group.quantity,
    rateGroupFingerprint: group.fingerprint,
  }));
  const link: LocalStripeProviderLink = {
    id: "link-1",
    customerSubscriptionId: config.id,
    provider: "stripe",
    externalSubscriptionId: "sub-1",
    providerStatus: "active",
    endedAt: null,
    providerItems,
  };
  const observed: ObservedStripeSubscription = {
    externalSubscriptionId: link.externalSubscriptionId,
    status: "active",
    currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
    items: providerItems.map((item) => ({
      externalSubscriptionItemId: item.externalSubscriptionItemId,
      externalPriceId: item.externalPriceId,
      currency: item.currency,
      billingIntervalMonths: item.billingIntervalMonths,
      unitAmount: item.agreedAmountPerCycle,
      quantity: item.quantity,
    })),
  };
  return { link, observed };
}

test("activation approval preserves EC$25 x2 plus negotiated EC$20 x1", () => {
  const config = configuration({ lifecycle: "pending_activation" });
  const proposal = buildCanonicalStripeOperationProposal({
    kind: "activation",
    configuration: config,
    providerLink: null,
    observed: null,
  });
  assert.equal(proposal.expectedRecurringTotal, "70.00");
  assert.deepEqual(proposal.rateGroups.map((group) => [group.agreedAmountPerCycle, group.quantity]), [
    ["20.00", 1],
    ["25.00", 2],
  ]);
  assert.ok(proposal.actions.every((action) => action.kind === "create_rate_group"));
});

test("activation retains exact negotiated annual prices without discount reconstruction", () => {
  const config = configuration({
    lifecycle: "pending_activation",
    interval: 12,
    amounts: [{ id: "annual-negotiated", amount: "275.00", classification: "negotiated" }],
  });
  const proposal = buildCanonicalStripeOperationProposal({
    kind: "activation",
    configuration: config,
    providerLink: null,
    observed: null,
  });
  assert.equal(proposal.billingIntervalMonths, 12);
  assert.equal(proposal.expectedRecurringTotal, "275.00");
  assert.equal(proposal.rateGroups[0].items[0].classification, "negotiated");
});

test("operation identity and explicit approval token are deterministic and source-sensitive", () => {
  const config = configuration({ lifecycle: "pending_activation" });
  const first = buildCanonicalStripeOperationProposal({ kind: "activation", configuration: config, providerLink: null, observed: null });
  const repeated = buildCanonicalStripeOperationProposal({ kind: "activation", configuration: config, providerLink: null, observed: null });
  assert.equal(first.operationKey, repeated.operationKey);
  assert.equal(first.confirmationToken, repeated.confirmationToken);
  assert.doesNotThrow(() => assertCanonicalStripeOperationApproval({
    proposal: first,
    confirmed: true,
    confirmationToken: first.confirmationToken,
    approvedBy: "operator-1",
    approvalReason: "Reviewed canonical activation",
  }));
  const changed = configuration({ lifecycle: "pending_activation", amounts: [{ id: "service-a", amount: "26.00" }] });
  const changedProposal = buildCanonicalStripeOperationProposal({ kind: "activation", configuration: changed, providerLink: null, observed: null });
  assert.notEqual(first.operationKey, changedProposal.operationKey);
});

test("unconfirmed, stale-token, and evidence-free approvals are rejected", () => {
  const proposal = buildCanonicalStripeOperationProposal({
    kind: "activation",
    configuration: configuration({ lifecycle: "pending_activation" }),
    providerLink: null,
    observed: null,
  });
  for (const [confirmed, token, approvedBy, reason, code] of [
    [false, proposal.confirmationToken, "operator", "reason", "EXPLICIT_APPROVAL_REQUIRED"],
    [true, "stale", "operator", "reason", "APPROVAL_TOKEN_MISMATCH"],
    [true, proposal.confirmationToken, "", "", "APPROVAL_EVIDENCE_REQUIRED"],
  ] as const) {
    assert.throws(
      () => assertCanonicalStripeOperationApproval({ proposal, confirmed, confirmationToken: token, approvedBy, approvalReason: reason }),
      (caught: unknown) => caught instanceof CanonicalStripeExecutionError && caught.code === code,
    );
  }
});

test("synchronization previews quantity changes with no proration and a preserved anniversary", () => {
  const config = configuration();
  const { link, observed } = linkedProvider(config);
  observed.items[1].quantity = 1;
  const proposal = buildCanonicalStripeOperationProposal({
    kind: "synchronization",
    configuration: config,
    providerLink: link,
    observed,
    observedOwnerSubscriptionId: config.id,
  });
  assert.equal(proposal.nextBillingDate.toISOString().slice(0, 10), "2026-11-01");
  assert.equal(proposal.actions.some((action) => action.kind === "update_quantity"), true);
  assert.equal(proposal.providerStateFingerprint, canonicalStripeProviderStateFingerprint(observed));
});

test("new and obsolete rate groups produce create and retire actions without automatic correction", () => {
  const config = configuration();
  const { link, observed } = linkedProvider(config);
  const removed = link.providerItems.shift()!;
  observed.items = observed.items.filter((item) => item.externalSubscriptionItemId !== removed.externalSubscriptionItemId);
  link.providerItems.push({
    id: "mapping-obsolete",
    subscriptionProviderLinkId: link.id,
    externalSubscriptionItemId: "si-obsolete",
    externalPriceId: "price-obsolete",
    currency: "XCD",
    billingIntervalMonths: 1,
    agreedAmountPerCycle: "30.00",
    quantity: 1,
    rateGroupFingerprint: "XCD:1:30.00",
  });
  observed.items.push({
    externalSubscriptionItemId: "si-obsolete",
    externalPriceId: "price-obsolete",
    currency: "XCD",
    billingIntervalMonths: 1,
    unitAmount: "30.00",
    quantity: 1,
  });
  const proposal = buildCanonicalStripeOperationProposal({
    kind: "synchronization",
    configuration: config,
    providerLink: link,
    observed,
    observedOwnerSubscriptionId: config.id,
  });
  assert.equal(proposal.actions.some((action) => action.kind === "create_rate_group"), true);
  assert.equal(proposal.actions.some((action) => action.kind === "retire_rate_group"), true);
});

test("independent subscriptions receive independent operation identities", () => {
  const first = buildCanonicalStripeOperationProposal({
    kind: "activation",
    configuration: configuration({ id: "subscription-a", lifecycle: "pending_activation" }),
    providerLink: null,
    observed: null,
  });
  const second = buildCanonicalStripeOperationProposal({
    kind: "activation",
    configuration: configuration({ id: "subscription-b", lifecycle: "pending_activation" }),
    providerLink: null,
    observed: null,
  });
  assert.notEqual(first.operationKey, second.operationKey);
});

test("legacy, shadow, and production execution remain blocked", () => {
  for (const controlMode of ["legacy", "shadow"] as const) {
    assert.throws(
      () => buildCanonicalStripeOperationProposal({
        kind: "activation",
        configuration: configuration({ lifecycle: "pending_activation", controlMode }),
        providerLink: null,
        observed: null,
      }),
      (caught: unknown) => caught instanceof CanonicalStripeExecutionError,
    );
  }
  assert.throws(
    () => assertCanonicalStripeExecutionEnabled({ NODE_ENV: "production", CANONICAL_STRIPE_EXECUTION_ENABLED: "true" }),
    (caught: unknown) => caught instanceof CanonicalStripeExecutionError && caught.code === "PRODUCTION_EXECUTION_DISABLED",
  );
  assert.throws(
    () => assertCanonicalStripeExecutionEnabled({ NODE_ENV: "test", VERCEL_ENV: "production", CANONICAL_STRIPE_EXECUTION_ENABLED: "true" }),
    (caught: unknown) => caught instanceof CanonicalStripeExecutionError && caught.code === "PRODUCTION_EXECUTION_DISABLED",
  );
});

test("Phase 3B2 migration is additive and preserves legacy operation records", () => {
  const migration = readFileSync(
    new URL("../prisma/migrations/20261016120000_canonical_stripe_execution/migration.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /ADD VALUE 'canonical_stripe_activation'/);
  assert.match(migration, /ADD VALUE 'canonical_stripe_synchronization'/);
  assert.match(migration, /ADD COLUMN "providerEventCreatedAt"/);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
});
