import "server-only";

import { Prisma, type SubscriptionRateClassification } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  CanonicalSubscriptionValidationError,
  commercialDate,
  commercialDateString,
  exactCycleAmount,
  normalizeCurrency,
} from "@/lib/domain/canonical-subscription-application";
import {
  computeProration,
  cycleWindowForRenewal,
  recurringTotalsAfterAddition,
  type ProrationResult,
  type SubscriptionProrationMethod,
} from "@/lib/domain/subscription-proration";
import {
  addBillableServiceInTransaction,
  createAssignmentForAvailableDeviceInTransaction,
  recordInitialAdjustment,
} from "@/lib/services/canonical-subscription-application-service";

function fail(code: string, message: string): never {
  throw new CanonicalSubscriptionValidationError(code, message);
}

const ADDABLE_LIFECYCLES = ["pending_activation", "active", "paused"] as const;

export type ServiceHardwareChoice =
  | { kind: "none" }
  | { kind: "device"; deviceId: string }
  | { kind: "assignment"; assignmentId: string };

export type ServiceAdjustmentChoice =
  | { method: "none" }
  | { method: SubscriptionProrationMethod; manualAmount?: string | null; reason?: string | null };

export type AddServiceToSubscriptionInput = {
  subscriptionId: string;
  /** Idempotency key generated when the flow opens; a replay returns the same service. */
  creationKey: string;
  label: string;
  /** Date the service starts (date-only). */
  startDate: string;
  agreedAmountPerCycle: string;
  rateClassification: SubscriptionRateClassification;
  rateChangeReason?: string | null;
  notes?: string | null;
  hardware: ServiceHardwareChoice;
  adjustment: ServiceAdjustmentChoice;
  actorUserId: string;
};

export type AddServiceToSubscriptionResult = {
  subscriptionId: string;
  customerId: string;
  subscriptionItemId: string;
  /** False when the same creationKey had already been submitted. */
  created: boolean;
  deviceId: string | null;
  proration: ProrationResult | null;
  recurringTotalAfterCents: number;
};

/**
 * Add one billable service to an existing canonical subscription.
 *
 * Inherits cadence, currency, collection method and renewal from the subscription.
 * The service joins recurring billing on the next renewal; any partial period is a
 * separate, auditable adjustment record. In ONE serializable transaction this
 * creates the service, its rate, optional hardware assignment and the adjustment
 * record. It never creates an invoice, contacts a provider, or notifies anyone.
 */
export async function addServiceToSubscription(input: AddServiceToSubscriptionInput): Promise<AddServiceToSubscriptionResult> {
  const creationKey = input.creationKey.trim();
  if (creationKey.length < 8 || creationKey.length > 128) {
    fail("CREATION_KEY_REQUIRED", "A valid submission key is required so a retry cannot add the service twice.");
  }
  const label = input.label.trim();
  if (!label) fail("LABEL_REQUIRED", "Give the service a name, such as the vehicle or asset.");
  const amount = exactCycleAmount(input.agreedAmountPerCycle, "Service price");
  if (amount.isZero()) fail("PRICE_REQUIRED", "Enter the agreed price for one billing cycle.");

  const run = () => prisma.$transaction(async (tx) => {
    const replay = await tx.subscriptionItem.findUnique({
      where: { creationKey },
      select: {
        id: true,
        customerSubscriptionId: true,
        customerSubscription: { select: { customerId: true } },
        serviceAssignments: { where: { endDate: null }, select: { deviceId: true }, take: 1 },
      },
    });
    if (replay) {
      if (replay.customerSubscriptionId !== input.subscriptionId) {
        fail("CREATION_KEY_CONFLICT", "This submission key belongs to a different subscription.");
      }
      const total = await currentRenewalCents(tx, input.subscriptionId);
      return {
        subscriptionId: input.subscriptionId,
        customerId: replay.customerSubscription.customerId,
        subscriptionItemId: replay.id,
        created: false,
        deviceId: replay.serviceAssignments[0]?.deviceId ?? null,
        proration: null,
        recurringTotalAfterCents: total,
      };
    }

    await tx.$queryRaw`SELECT "id" FROM "CustomerSubscription" WHERE "id" = ${input.subscriptionId} FOR UPDATE`;
    const subscription = await tx.customerSubscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        id: true,
        customerId: true,
        controlMode: true,
        lifecycleStatus: true,
        billingIntervalMonths: true,
        currency: true,
        nextBillingDate: true,
      },
    });
    if (!subscription) fail("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
    if (subscription.controlMode !== "canonical") {
      fail("SUBSCRIPTION_NOT_MANAGEABLE", "Services can only be added to a canonical subscription. This record is source-controlled.");
    }
    if (!subscription.lifecycleStatus || !(ADDABLE_LIFECYCLES as readonly string[]).includes(subscription.lifecycleStatus)) {
      fail(
        "SUBSCRIPTION_NOT_ADDABLE",
        subscription.lifecycleStatus === "draft"
          ? "This subscription is still a draft. Add services from its setup checklist instead."
          : "Services cannot be added to a closed subscription.",
      );
    }
    if (!subscription.billingIntervalMonths || !subscription.nextBillingDate || !subscription.currency) {
      fail("INCOMPLETE_SUBSCRIPTION", "The subscription needs a billing cadence, currency and renewal date first.");
    }
    const currency = normalizeCurrency(subscription.currency);
    const renewal = commercialDateString(subscription.nextBillingDate);
    const window = cycleWindowForRenewal(renewal, subscription.billingIntervalMonths);
    const start = commercialDateString(commercialDate(input.startDate, "Service start date"));
    if (start < window.cycleStart) {
      fail("START_BEFORE_CYCLE", `The service start must be within the current cycle (${window.cycleStart} to ${renewal}). Earlier dates need a manual back-billing decision.`);
    }
    if (start > renewal) {
      fail("START_AFTER_RENEWAL", "The service start is after the next renewal. Start it on or before the renewal date.");
    }

    let proration: ProrationResult | null = null;
    if (input.adjustment.method !== "none") {
      proration = computeProration({
        startDate: start,
        renewalDate: renewal,
        billingIntervalMonths: subscription.billingIntervalMonths,
        cycleAmount: amount.toFixed(2),
        currency,
        method: input.adjustment.method,
        manualAmount: input.adjustment.method === "manual_amount" ? input.adjustment.manualAmount ?? null : null,
        reason: input.adjustment.reason ?? null,
      });
    }

    let serviceAssignmentId: string | null = null;
    let deviceId: string | null = null;
    if (input.hardware.kind === "device") {
      deviceId = input.hardware.deviceId;
      serviceAssignmentId = await createAssignmentForAvailableDeviceInTransaction(tx, {
        customerId: subscription.customerId,
        deviceId: input.hardware.deviceId,
        startDate: commercialDate(start, "startDate"),
        nextDueDate: subscription.nextBillingDate,
        intervalMonths: subscription.billingIntervalMonths,
      });
    } else if (input.hardware.kind === "assignment") {
      serviceAssignmentId = input.hardware.assignmentId;
      const existing = await tx.serviceAssignment.findUnique({ where: { id: serviceAssignmentId }, select: { deviceId: true } });
      deviceId = existing?.deviceId ?? null;
    }

    const itemId = await addBillableServiceInTransaction(tx, subscription.id, {
      label,
      notes: input.notes ?? null,
      creationKey,
      serviceActivatedDate: start,
      // The service joins the recurring cycle on the inherited renewal.
      billingEffectiveFrom: renewal,
      agreedAmountPerCycle: amount.toFixed(2),
      rateClassification: input.rateClassification,
      rateChangeReason: input.rateChangeReason ?? (input.rateClassification === "negotiated" ? "Negotiated rate for added service" : "Added service at standard rate"),
      serviceAssignmentId,
      createdById: input.actorUserId,
    });

    if (proration && proration.amountCents > 0) {
      await recordInitialAdjustment(tx, itemId, proration, input.actorUserId);
    }

    return {
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
      subscriptionItemId: itemId,
      created: true,
      deviceId,
      proration,
      recurringTotalAfterCents: await currentRenewalCents(tx, subscription.id),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const serialization = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      // A concurrent identical submission: the unique key means the other one won.
      const duplicateKey = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!serialization && !duplicateKey) throw error;
    }
  }
  throw lastError;
}

/** Sum of effective cycle rates for services that bill on the next renewal. */
async function currentRenewalCents(tx: Prisma.TransactionClient, subscriptionId: string): Promise<number> {
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      nextBillingDate: true,
      items: {
        where: { status: { notIn: ["ended", "canceled"] } },
        select: {
          billingEffectiveFrom: true,
          billingEffectiveUntil: true,
          rates: { select: { agreedAmountPerCycle: true, effectiveFrom: true, effectiveUntil: true } },
        },
      },
    },
  });
  if (!subscription?.nextBillingDate) return 0;
  const renewal = subscription.nextBillingDate;
  const amounts = subscription.items.flatMap((item) => {
    if (!item.billingEffectiveFrom || item.billingEffectiveFrom > renewal) return [];
    if (item.billingEffectiveUntil && item.billingEffectiveUntil <= renewal) return [];
    const rate = item.rates.find((candidate) => candidate.effectiveFrom <= renewal && (!candidate.effectiveUntil || candidate.effectiveUntil > renewal));
    return rate ? [rate.agreedAmountPerCycle.toFixed(2)] : [];
  });
  return recurringTotalsAfterAddition(amounts, "0.00").futureCents;
}

export type ServiceAdditionContext = {
  subscription: {
    id: string;
    name: string | null;
    customerId: string;
    customerLabel: string;
    billingIntervalMonths: number;
    currency: string;
    collectionMethod: string | null;
    lifecycleStatus: string;
    nextBillingDate: string;
    gracePeriodDays: number;
  };
  cycle: { cycleStart: string; cycleEnd: string; totalDays: number };
  existingServices: { id: string; label: string; cycleAmount: string; startDate: string | null }[];
  currentRecurringCents: number;
  suggestedPrice: string;
  availableDevices: { id: string; label: string; simLabel: string | null; imei: string; iccid: string | null }[];
  unlinkedAssignments: { id: string; label: string }[];
  /** Why the flow is unavailable for this subscription, or null when services can be added. */
  blockedReason: string | null;
};

function customerLabel(customer: { company: string | null; firstName: string | null; lastName: string | null }): string {
  return customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Unnamed customer";
}

/** Read-only context for the contextual add-service flow. */
export async function getServiceAdditionContext(subscriptionId: string): Promise<ServiceAdditionContext | null> {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: { select: { company: true, firstName: true, lastName: true } },
      items: {
        where: { status: { notIn: ["ended", "canceled"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { rates: { orderBy: { effectiveFrom: "asc" } } },
      },
    },
  });
  if (!subscription || subscription.controlMode === "legacy") return null;

  let blockedReason: string | null = null;
  if (subscription.controlMode !== "canonical") blockedReason = "This record is source-controlled and cannot be changed here.";
  else if (!subscription.lifecycleStatus || !(ADDABLE_LIFECYCLES as readonly string[]).includes(subscription.lifecycleStatus)) {
    blockedReason = subscription.lifecycleStatus === "draft"
      ? "This subscription is still a draft. Finish setup from its details page."
      : "This subscription is closed.";
  } else if (!subscription.billingIntervalMonths || !subscription.nextBillingDate || !subscription.currency) {
    blockedReason = "Set a billing cadence, currency and renewal date before adding services.";
  }
  if (!subscription.billingIntervalMonths || !subscription.nextBillingDate || !subscription.currency) {
    if (!blockedReason) blockedReason = "Subscription configuration is incomplete.";
  }

  const renewal = subscription.nextBillingDate ?? new Date();
  const interval = subscription.billingIntervalMonths ?? 12;
  const existingServices = subscription.items.map((item) => {
    const rate = item.rates.find((candidate) => candidate.effectiveFrom <= renewal && (!candidate.effectiveUntil || candidate.effectiveUntil > renewal)) ?? item.rates.at(-1);
    return {
      id: item.id,
      label: item.label?.trim() || "Tracking service",
      cycleAmount: rate ? rate.agreedAmountPerCycle.toFixed(2) : "0.00",
      startDate: item.serviceActivatedDate ? commercialDateString(item.serviceActivatedDate) : null,
      effectiveAtRenewal: Boolean(item.billingEffectiveFrom && item.billingEffectiveFrom <= renewal && rate),
    };
  });
  const currentRecurringCents = recurringTotalsAfterAddition(
    existingServices.filter((service) => service.effectiveAtRenewal).map((service) => service.cycleAmount),
    "0.00",
  ).futureCents;

  const [devices, assignments] = await Promise.all([
    prisma.device.findMany({
      where: {
        status: { notIn: ["decommissioned", "lost"] },
        serviceAssignments: { none: { endDate: null, status: { not: "cancelled" } } },
      },
      orderBy: [{ label: "asc" }, { imei: "asc" }],
      select: { id: true, label: true, imei: true, deviceModel: { select: { name: true } }, simCard: { select: { label: true, msisdn: true, iccid: true } } },
      take: 500,
    }),
    prisma.serviceAssignment.findMany({
      where: { customerId: subscription.customerId, subscriptionItemId: null, endDate: null, status: { not: "cancelled" } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      select: { id: true, device: { select: { label: true, deviceModel: { select: { name: true } } } } },
    }),
  ]);

  const window = cycleWindowForRenewal(commercialDateString(renewal), interval);
  return {
    subscription: {
      id: subscription.id,
      name: subscription.name,
      customerId: subscription.customerId,
      customerLabel: customerLabel(subscription.customer),
      billingIntervalMonths: interval,
      currency: subscription.currency ?? "XCD",
      collectionMethod: subscription.collectionMethod,
      lifecycleStatus: subscription.lifecycleStatus ?? "unclassified",
      nextBillingDate: commercialDateString(renewal),
      gracePeriodDays: subscription.gracePeriodDays,
    },
    cycle: window,
    existingServices: existingServices.map((service) => ({
      id: service.id,
      label: service.label,
      cycleAmount: service.cycleAmount,
      startDate: service.startDate,
    })),
    currentRecurringCents,
    suggestedPrice: existingServices.at(-1)?.cycleAmount ?? subscription.agreedAmountPerCycle?.toFixed(2) ?? "",
    availableDevices: devices.map((device) => ({
      id: device.id,
      label: device.label?.trim() || `${device.deviceModel.name} device`,
      simLabel: device.simCard?.label?.trim() || device.simCard?.msisdn?.trim() || null,
      imei: device.imei,
      iccid: device.simCard?.iccid ?? null,
    })),
    unlinkedAssignments: assignments.map((assignment) => ({
      id: assignment.id,
      label: assignment.device.label?.trim() || assignment.device.deviceModel.name,
    })),
    blockedReason,
  };
}
