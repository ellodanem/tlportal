import "server-only";

import {
  Prisma,
  type SubscriptionCollectionMethod,
  type SubscriptionLifecycleStatus,
  type SubscriptionRateClassification,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  CanonicalSubscriptionValidationError,
  assertLifecycleTransition,
  assertSubscriptionDates,
  canonicalBillingInterval,
  canonicalGracePeriodDays,
  commercialDate,
  commercialDateString,
  exactCycleAmount,
  itemStatusForSubscription,
  normalizeCurrency,
  previewAnnualProration,
  recurringEffectiveDateForAddition,
  type AnnualProrationPreview,
  type ExactMoneyInput,
} from "@/lib/domain/canonical-subscription-application";
import {
  assertNoOverlappingItemRates,
  assertValidEffectiveRatePeriod,
} from "@/lib/domain/subscription-item-foundation";

const subscriptionDetailsInclude = {
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      rates: { orderBy: { effectiveFrom: "asc" } },
      serviceAssignments: { orderBy: { createdAt: "asc" } },
      predecessorItem: { select: { id: true, customerSubscriptionId: true, label: true } },
      successorItem: { select: { id: true, customerSubscriptionId: true, label: true } },
    },
  },
  providerLinks: {
    orderBy: { activatedAt: "asc" },
    include: { providerItems: true },
  },
} satisfies Prisma.CustomerSubscriptionInclude;

type SubscriptionDetails = Prisma.CustomerSubscriptionGetPayload<{
  include: typeof subscriptionDetailsInclude;
}>;

type EditableSubscription = {
  id: string;
  customerId: string;
  name: string | null;
  collectionMethod: SubscriptionCollectionMethod | null;
  lifecycleStatus: SubscriptionLifecycleStatus | null;
  billingIntervalMonths: number | null;
  currency: string | null;
  agreedAmountPerCycle: Prisma.Decimal | null;
  commercialStartDate: Date | null;
  billingAnchorDate: Date | null;
  nextBillingDate: Date | null;
  controlMode: "legacy" | "shadow" | "canonical";
};

export type CreateCanonicalSubscriptionItemInput = {
  label?: string | null;
  notes?: string | null;
  serviceActivatedDate?: string | null;
  billingEffectiveFrom?: string | null;
  billingEffectiveUntil?: string | null;
  agreedAmountPerCycle?: ExactMoneyInput | null;
  rateClassification?: SubscriptionRateClassification;
  rateEffectiveFrom?: string | null;
  rateEffectiveUntil?: string | null;
  rateChangeReason?: string | null;
  serviceAssignmentId?: string | null;
  createdById?: string | null;
};

export type CreateDraftCanonicalSubscriptionInput = {
  customerId: string;
  name: string;
  reference?: string | null;
  billingIntervalMonths: number;
  collectionMethod: SubscriptionCollectionMethod;
  currency: string;
  defaultAgreedAmountPerCycle: ExactMoneyInput;
  commercialStartDate: string;
  billingAnchorDate: string;
  nextBillingDate: string;
  gracePeriodDays?: number | null;
  items?: CreateCanonicalSubscriptionItemInput[];
};

function validation(code: string, message: string): never {
  throw new CanonicalSubscriptionValidationError(code, message);
}

function cleanRequiredText(value: string, field: string): string {
  const cleaned = value.trim();
  if (!cleaned) validation("REQUIRED_FIELD", `${field} is required.`);
  return cleaned;
}

function cleanOptionalText(value?: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

async function requireEditableSubscription(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
): Promise<EditableSubscription> {
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      customerId: true,
      name: true,
      collectionMethod: true,
      lifecycleStatus: true,
      billingIntervalMonths: true,
      currency: true,
      agreedAmountPerCycle: true,
      commercialStartDate: true,
      billingAnchorDate: true,
      nextBillingDate: true,
      controlMode: true,
    },
  });
  if (!subscription) validation("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  if (subscription.controlMode !== "shadow") {
    validation(
      "SUBSCRIPTION_NOT_EDITABLE",
      "Phase 1B operations are restricted to shadow-mode canonical subscriptions.",
    );
  }
  if (!subscription.lifecycleStatus) {
    validation("SUBSCRIPTION_NOT_CANONICAL", "Subscription has no canonical lifecycle.");
  }
  return subscription;
}

function requireCanonicalCommercialFields(subscription: EditableSubscription): {
  lifecycleStatus: SubscriptionLifecycleStatus;
  billingIntervalMonths: 1 | 3 | 6 | 12;
  currency: string;
  agreedAmountPerCycle: Prisma.Decimal;
  nextBillingDate: Date;
} {
  if (
    !subscription.lifecycleStatus ||
    subscription.billingIntervalMonths == null ||
    !subscription.currency ||
    !subscription.agreedAmountPerCycle ||
    !subscription.nextBillingDate
  ) {
    validation("INCOMPLETE_SUBSCRIPTION", "Canonical subscription configuration is incomplete.");
  }
  return {
    lifecycleStatus: subscription.lifecycleStatus,
    billingIntervalMonths: canonicalBillingInterval(subscription.billingIntervalMonths),
    currency: normalizeCurrency(subscription.currency),
    agreedAmountPerCycle: subscription.agreedAmountPerCycle,
    nextBillingDate: subscription.nextBillingDate,
  };
}

function recurringEffectiveDate(
  subscription: EditableSubscription,
  serviceActivatedDate?: string | null,
  requested?: string | null,
): Date {
  const fields = requireCanonicalCommercialFields(subscription);
  if (requested) return commercialDate(requested, "billingEffectiveFrom");
  if (serviceActivatedDate) {
    return commercialDate(
      recurringEffectiveDateForAddition({
        serviceActivatedDate,
        nextRenewalDate: commercialDateString(fields.nextBillingDate),
      }),
      "billingEffectiveFrom",
    );
  }
  return fields.nextBillingDate;
}

async function validateAssignmentForItem(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  expectedCustomerId: string,
): Promise<void> {
  const assignment = await tx.serviceAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      customerId: true,
      subscriptionItemId: true,
      status: true,
      endDate: true,
    },
  });
  if (!assignment) validation("ASSIGNMENT_NOT_FOUND", "Service assignment not found.");
  if (assignment.customerId !== expectedCustomerId) {
    validation(
      "CROSS_CUSTOMER_ASSIGNMENT",
      "A service assignment must belong to the subscription customer.",
    );
  }
  if (assignment.subscriptionItemId) {
    validation("ASSIGNMENT_CONFLICT", "Service assignment is already linked to a subscription item.");
  }
  if (assignment.endDate || assignment.status === "cancelled") {
    validation("ASSIGNMENT_CLOSED", "A closed service assignment cannot be linked.");
  }
}

async function addBillableServiceInTransaction(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  input: CreateCanonicalSubscriptionItemInput,
): Promise<string> {
  const subscription = await requireEditableSubscription(tx, subscriptionId);
  const fields = requireCanonicalCommercialFields(subscription);
  if (["canceled", "ended"].includes(fields.lifecycleStatus)) {
    validation("SUBSCRIPTION_CLOSED", "Services cannot be added to a closed subscription.");
  }

  const serviceActivatedDate = input.serviceActivatedDate
    ? commercialDate(input.serviceActivatedDate, "serviceActivatedDate")
    : null;
  const billingEffectiveFrom = recurringEffectiveDate(
    subscription,
    input.serviceActivatedDate,
    input.billingEffectiveFrom,
  );
  const billingEffectiveUntil = input.billingEffectiveUntil
    ? commercialDate(input.billingEffectiveUntil, "billingEffectiveUntil")
    : null;
  if (serviceActivatedDate && billingEffectiveFrom < serviceActivatedDate) {
    validation(
      "INVALID_ITEM_DATES",
      "billingEffectiveFrom cannot be before serviceActivatedDate.",
    );
  }
  if (billingEffectiveUntil && billingEffectiveUntil <= billingEffectiveFrom) {
    validation(
      "INVALID_ITEM_DATES",
      "billingEffectiveUntil must be later than billingEffectiveFrom.",
    );
  }

  const amount = input.agreedAmountPerCycle == null
    ? fields.agreedAmountPerCycle
    : exactCycleAmount(input.agreedAmountPerCycle);
  const classification = input.rateClassification ?? (
    input.agreedAmountPerCycle != null && !amount.equals(fields.agreedAmountPerCycle)
      ? "negotiated"
      : "standard"
  );
  const rateEffectiveFrom = input.rateEffectiveFrom
    ? commercialDate(input.rateEffectiveFrom, "rateEffectiveFrom")
    : (serviceActivatedDate ?? billingEffectiveFrom);
  const rateEffectiveUntil = input.rateEffectiveUntil
    ? commercialDate(input.rateEffectiveUntil, "rateEffectiveUntil")
    : null;

  assertValidEffectiveRatePeriod({
    subscriptionItemId: "pending-item",
    billingIntervalMonths: fields.billingIntervalMonths,
    effectiveFrom: commercialDateString(rateEffectiveFrom),
    effectiveUntil: rateEffectiveUntil ? commercialDateString(rateEffectiveUntil) : null,
  });

  if (input.serviceAssignmentId) {
    await validateAssignmentForItem(tx, input.serviceAssignmentId, subscription.customerId);
  }

  const item = await tx.subscriptionItem.create({
    data: {
      customerSubscriptionId: subscription.id,
      label: cleanOptionalText(input.label),
      notes: cleanOptionalText(input.notes),
      status: itemStatusForSubscription(fields.lifecycleStatus),
      serviceActivatedDate,
      billingEffectiveFrom,
      billingEffectiveUntil,
      rates: {
        create: {
          billingIntervalMonths: fields.billingIntervalMonths,
          agreedAmountPerCycle: amount,
          currency: fields.currency,
          effectiveFrom: rateEffectiveFrom,
          effectiveUntil: rateEffectiveUntil,
          classification,
          changeReason: cleanOptionalText(input.rateChangeReason),
          createdById: input.createdById ?? null,
        },
      },
    },
    select: { id: true },
  });

  if (input.serviceAssignmentId) {
    await tx.serviceAssignment.update({
      where: { id: input.serviceAssignmentId },
      data: { subscriptionItemId: item.id },
    });
  }
  return item.id;
}

export async function createDraftCanonicalSubscription(
  input: CreateDraftCanonicalSubscriptionInput,
): Promise<SubscriptionDetails> {
  const name = cleanRequiredText(input.name, "name");
  const customerId = cleanRequiredText(input.customerId, "customerId");
  const billingIntervalMonths = canonicalBillingInterval(input.billingIntervalMonths);
  const currency = normalizeCurrency(input.currency);
  const agreedAmountPerCycle = exactCycleAmount(input.defaultAgreedAmountPerCycle);
  const dates = assertSubscriptionDates(input);
  const gracePeriodDays = canonicalGracePeriodDays(input.gracePeriodDays);

  const subscriptionId = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) validation("CUSTOMER_NOT_FOUND", "Customer not found.");

    const subscription = await tx.customerSubscription.create({
      data: {
        customerId,
        name,
        reference: cleanOptionalText(input.reference),
        collectionMethod: input.collectionMethod,
        lifecycleStatus: "draft",
        collectionHealth: "not_started",
        billingIntervalMonths,
        currency,
        agreedAmountPerCycle,
        commercialStartDate: dates.commercialStartDate,
        billingAnchorDate: dates.billingAnchorDate,
        nextBillingDate: dates.nextBillingDate,
        gracePeriodDays,
        controlMode: "shadow",
        status: "pending_payment",
        planTermMonths: billingIntervalMonths,
      },
      select: { id: true },
    });

    for (const item of input.items ?? []) {
      await addBillableServiceInTransaction(tx, subscription.id, item);
    }
    return subscription.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return getCanonicalSubscriptionById(subscriptionId);
}

export async function getCanonicalSubscriptionById(
  subscriptionId: string,
): Promise<SubscriptionDetails> {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    include: subscriptionDetailsInclude,
  });
  if (!subscription) validation("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  return subscription;
}

export async function listCanonicalSubscriptionsForCustomer(
  customerId: string,
): Promise<SubscriptionDetails[]> {
  return prisma.customerSubscription.findMany({
    where: { customerId, controlMode: { in: ["shadow", "canonical"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: subscriptionDetailsInclude,
  });
}

export async function listActiveCanonicalSubscriptions(
  customerId?: string,
): Promise<SubscriptionDetails[]> {
  return prisma.customerSubscription.findMany({
    where: {
      customerId,
      lifecycleStatus: "active",
      controlMode: { in: ["shadow", "canonical"] },
    },
    orderBy: [{ nextBillingDate: "asc" }, { createdAt: "asc" }],
    include: subscriptionDetailsInclude,
  });
}

export async function getSubscriptionItemsWithEffectiveRates(
  subscriptionId: string,
  effectiveOn: string,
) {
  const onDate = commercialDate(effectiveOn, "effectiveOn");
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true },
  });
  if (!subscription) validation("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");

  return prisma.subscriptionItem.findMany({
    where: { customerSubscriptionId: subscriptionId },
    orderBy: { createdAt: "asc" },
    include: {
      serviceAssignments: { orderBy: { createdAt: "asc" } },
      rates: {
        where: {
          effectiveFrom: { lte: onDate },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: onDate } }],
        },
        orderBy: { effectiveFrom: "desc" },
      },
    },
  });
}

export async function previewAnnualSubscriptionAddition(input: {
  subscriptionId: string;
  annualPeriodStart: string;
  annualPeriodEnd: string;
  serviceActivatedDate: string;
  agreedAnnualAmount?: ExactMoneyInput | null;
}): Promise<AnnualProrationPreview> {
  const subscription = await prisma.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
    select: {
      controlMode: true,
      billingIntervalMonths: true,
      currency: true,
      agreedAmountPerCycle: true,
    },
  });
  if (!subscription) validation("SUBSCRIPTION_NOT_FOUND", "Subscription not found.");
  if (subscription.controlMode !== "shadow") {
    validation(
      "SUBSCRIPTION_NOT_EDITABLE",
      "Phase 1B previews are restricted to shadow-mode canonical subscriptions.",
    );
  }
  if (subscription.billingIntervalMonths !== 12) {
    validation("NOT_ANNUAL", "Annual proration requires a 12-month subscription.");
  }
  if (!subscription.currency || !subscription.agreedAmountPerCycle) {
    validation("INCOMPLETE_SUBSCRIPTION", "Annual subscription pricing is incomplete.");
  }

  return previewAnnualProration({
    annualPeriodStart: input.annualPeriodStart,
    annualPeriodEnd: input.annualPeriodEnd,
    serviceActivatedDate: input.serviceActivatedDate,
    agreedAnnualAmount: input.agreedAnnualAmount ?? subscription.agreedAmountPerCycle,
    currency: subscription.currency,
  });
}

export async function addBillableServiceToSubscription(
  subscriptionId: string,
  input: CreateCanonicalSubscriptionItemInput,
): Promise<string> {
  return prisma.$transaction(
    (tx) => addBillableServiceInTransaction(tx, subscriptionId, input),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function scheduleSubscriptionItemEnd(input: {
  subscriptionItemId: string;
  effectiveUntil: string;
}): Promise<void> {
  const effectiveUntil = commercialDate(input.effectiveUntil, "effectiveUntil");
  await prisma.$transaction(async (tx) => {
    const item = await tx.subscriptionItem.findUnique({
      where: { id: input.subscriptionItemId },
      include: {
        customerSubscription: true,
        rates: { orderBy: { effectiveFrom: "asc" } },
      },
    });
    if (!item) validation("ITEM_NOT_FOUND", "Subscription item not found.");
    await requireEditableSubscription(tx, item.customerSubscriptionId);
    if (item.billingEffectiveFrom && effectiveUntil <= item.billingEffectiveFrom) {
      validation("INVALID_ITEM_DATES", "Item end must be later than billingEffectiveFrom.");
    }
    if (item.rates.some((rate) => rate.effectiveFrom >= effectiveUntil)) {
      validation(
        "FUTURE_RATE_CONFLICT",
        "Remove or reschedule future rates before ending this item.",
      );
    }

    await tx.subscriptionItemRate.updateMany({
      where: {
        subscriptionItemId: item.id,
        effectiveFrom: { lt: effectiveUntil },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: effectiveUntil } }],
      },
      data: { effectiveUntil },
    });
    await tx.subscriptionItem.update({
      where: { id: item.id },
      data: { billingEffectiveUntil: effectiveUntil },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function isPostgresConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P2002", "P2004"].includes(error.code);
  }
  return error instanceof Prisma.PrismaClientUnknownRequestError
    && /PostgresError[\s\S]*code: "23[A-Z0-9]{3}"/.test(error.message);
}

export async function scheduleSubscriptionItemRate(input: {
  subscriptionItemId: string;
  agreedAmountPerCycle: ExactMoneyInput;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  classification?: SubscriptionRateClassification;
  changeReason?: string | null;
  createdById?: string | null;
}): Promise<string> {
  const effectiveFrom = commercialDate(input.effectiveFrom, "effectiveFrom");
  const effectiveUntil = input.effectiveUntil
    ? commercialDate(input.effectiveUntil, "effectiveUntil")
    : null;
  const amount = exactCycleAmount(input.agreedAmountPerCycle);

  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findUnique({
        where: { id: input.subscriptionItemId },
        include: { rates: { orderBy: { effectiveFrom: "asc" } } },
      });
      if (!item) validation("ITEM_NOT_FOUND", "Subscription item not found.");
      const subscription = await requireEditableSubscription(tx, item.customerSubscriptionId);
      const fields = requireCanonicalCommercialFields(subscription);
      const effectiveFromString = commercialDateString(effectiveFrom);
      const effectiveUntilString = effectiveUntil ? commercialDateString(effectiveUntil) : null;
      assertValidEffectiveRatePeriod({
        subscriptionItemId: item.id,
        billingIntervalMonths: fields.billingIntervalMonths,
        effectiveFrom: effectiveFromString,
        effectiveUntil: effectiveUntilString,
      });

      const predecessor = item.rates.find((rate) =>
        rate.billingIntervalMonths === fields.billingIntervalMonths
        && rate.effectiveUntil == null
        && rate.effectiveFrom < effectiveFrom,
      );
      const adjustedRates = item.rates.map((rate) => ({
        subscriptionItemId: item.id,
        billingIntervalMonths: rate.billingIntervalMonths,
        effectiveFrom: commercialDateString(rate.effectiveFrom),
        effectiveUntil: rate.id === predecessor?.id
          ? effectiveFromString
          : rate.effectiveUntil ? commercialDateString(rate.effectiveUntil) : null,
      }));
      adjustedRates.push({
        subscriptionItemId: item.id,
        billingIntervalMonths: fields.billingIntervalMonths,
        effectiveFrom: effectiveFromString,
        effectiveUntil: effectiveUntilString,
      });
      assertNoOverlappingItemRates(adjustedRates);

      if (predecessor) {
        await tx.subscriptionItemRate.update({
          where: { id: predecessor.id },
          data: { effectiveUntil: effectiveFrom },
        });
      }
      const rate = await tx.subscriptionItemRate.create({
        data: {
          subscriptionItemId: item.id,
          billingIntervalMonths: fields.billingIntervalMonths,
          agreedAmountPerCycle: amount,
          currency: fields.currency,
          effectiveFrom,
          effectiveUntil,
          classification: input.classification ?? "negotiated",
          changeReason: cleanOptionalText(input.changeReason),
          createdById: input.createdById ?? null,
        },
        select: { id: true },
      });
      return rate.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof CanonicalSubscriptionValidationError) throw error;
    if (isPostgresConstraintError(error)) {
      validation(
        "RATE_PERIOD_CONFLICT",
        "The effective rate period conflicts with an existing item rate.",
      );
    }
    throw error;
  }
}

export async function replaceSubscriptionItemHardware(input: {
  subscriptionItemId: string;
  replacementAssignmentId: string;
  replacedOn: string;
}): Promise<void> {
  const replacedOn = commercialDate(input.replacedOn, "replacedOn");
  await prisma.$transaction(async (tx) => {
    const item = await tx.subscriptionItem.findUnique({
      where: { id: input.subscriptionItemId },
      select: { id: true, customerSubscriptionId: true },
    });
    if (!item) validation("ITEM_NOT_FOUND", "Subscription item not found.");
    const subscription = await requireEditableSubscription(tx, item.customerSubscriptionId);
    await validateAssignmentForItem(tx, input.replacementAssignmentId, subscription.customerId);

    const current = await tx.serviceAssignment.findFirst({
      where: {
        subscriptionItemId: item.id,
        endDate: null,
        status: { not: "cancelled" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (current?.startDate && replacedOn < current.startDate) {
      validation("INVALID_REPLACEMENT_DATE", "Replacement cannot predate the current assignment.");
    }
    if (current) {
      await tx.serviceAssignment.update({
        where: { id: current.id },
        data: { endDate: replacedOn, status: "cancelled" },
      });
    }
    await tx.serviceAssignment.update({
      where: { id: input.replacementAssignmentId },
      data: {
        subscriptionItemId: item.id,
        startDate: replacedOn,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transferSubscriptionItem(input: {
  sourceSubscriptionItemId: string;
  targetSubscriptionId: string;
  transferDate: string;
  label?: string | null;
  agreedAmountPerCycle?: ExactMoneyInput | null;
  rateClassification?: SubscriptionRateClassification;
  changeReason?: string | null;
  successorAssignmentId?: string | null;
  createdById?: string | null;
}): Promise<string> {
  const transferDate = commercialDate(input.transferDate, "transferDate");
  return prisma.$transaction(async (tx) => {
    const source = await tx.subscriptionItem.findUnique({
      where: { id: input.sourceSubscriptionItemId },
      include: {
        rates: { orderBy: { effectiveFrom: "asc" } },
        successorItem: { select: { id: true } },
      },
    });
    if (!source) validation("ITEM_NOT_FOUND", "Source subscription item not found.");
    if (source.successorItem) validation("ITEM_ALREADY_TRANSFERRED", "Item already has a successor.");
    if (["ended", "canceled"].includes(source.status)) {
      validation("ITEM_CLOSED", "A closed item cannot be transferred.");
    }

    const sourceSubscription = await requireEditableSubscription(tx, source.customerSubscriptionId);
    const targetSubscription = await requireEditableSubscription(tx, input.targetSubscriptionId);
    if (sourceSubscription.id === targetSubscription.id) {
      validation("INVALID_TRANSFER", "Source and target subscriptions must be different.");
    }
    if (sourceSubscription.customerId !== targetSubscription.customerId) {
      validation("CROSS_CUSTOMER_TRANSFER", "Subscriptions in a transfer must share one customer.");
    }
    const targetFields = requireCanonicalCommercialFields(targetSubscription);
    if (source.billingEffectiveFrom && transferDate <= source.billingEffectiveFrom) {
      validation("INVALID_TRANSFER_DATE", "Transfer must follow the source billing effective date.");
    }
    if (source.rates.some((rate) => rate.effectiveFrom >= transferDate)) {
      validation("FUTURE_RATE_CONFLICT", "Future source rates must be resolved before transfer.");
    }
    if (input.successorAssignmentId) {
      await validateAssignmentForItem(
        tx,
        input.successorAssignmentId,
        targetSubscription.customerId,
      );
    }

    const successorBillingEffectiveFrom = recurringEffectiveDate(
      targetSubscription,
      input.transferDate,
      null,
    );
    const amount = input.agreedAmountPerCycle == null
      ? targetFields.agreedAmountPerCycle
      : exactCycleAmount(input.agreedAmountPerCycle);
    const successor = await tx.subscriptionItem.create({
      data: {
        customerSubscriptionId: targetSubscription.id,
        predecessorItemId: source.id,
        label: cleanOptionalText(input.label) ?? source.label,
        notes: source.notes,
        status: itemStatusForSubscription(targetFields.lifecycleStatus),
        serviceActivatedDate: transferDate,
        billingEffectiveFrom: successorBillingEffectiveFrom,
        rates: {
          create: {
            billingIntervalMonths: targetFields.billingIntervalMonths,
            agreedAmountPerCycle: amount,
            currency: targetFields.currency,
            effectiveFrom: transferDate,
            classification: input.rateClassification ?? "negotiated",
            changeReason: cleanOptionalText(input.changeReason) ?? "Subscription transfer",
            createdById: input.createdById ?? null,
          },
        },
      },
      select: { id: true },
    });

    await tx.subscriptionItemRate.updateMany({
      where: {
        subscriptionItemId: source.id,
        effectiveFrom: { lt: transferDate },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: transferDate } }],
      },
      data: { effectiveUntil: transferDate },
    });
    await tx.subscriptionItem.update({
      where: { id: source.id },
      data: {
        billingEffectiveUntil: transferDate,
        status: "ended",
        endedAt: new Date(),
      },
    });
    if (input.successorAssignmentId) {
      await tx.serviceAssignment.update({
        where: { id: input.successorAssignmentId },
        data: { subscriptionItemId: successor.id, startDate: transferDate },
      });
    }
    return successor.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionCanonicalSubscriptionLifecycle(
  subscriptionId: string,
  target: SubscriptionLifecycleStatus,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const editable = await requireEditableSubscription(tx, subscriptionId);
    const fields = requireCanonicalCommercialFields(editable);
    assertLifecycleTransition(fields.lifecycleStatus, target);

    if (target === "pending_activation" || target === "active") {
      const items = await tx.subscriptionItem.findMany({
        where: {
          customerSubscriptionId: subscriptionId,
          status: { notIn: ["ended", "canceled"] },
        },
        include: { rates: true },
      });
      if (!items.length) {
        validation("SUBSCRIPTION_HAS_NO_ITEMS", "Activation requires at least one billable service.");
      }
      if (target === "active") {
        for (const item of items) {
          if (!item.serviceActivatedDate || !item.billingEffectiveFrom) {
            validation(
              "INCOMPLETE_ITEM",
              "Every active service needs activation and billing-effective dates.",
            );
          }
          const matchingRate = item.rates.some((rate) =>
            rate.billingIntervalMonths === fields.billingIntervalMonths
            && normalizeCurrency(rate.currency) === fields.currency,
          );
          if (!matchingRate) {
            validation("ITEM_RATE_MISSING", "Every active service needs an agreed cycle rate.");
          }
        }
      }
    }

    await tx.customerSubscription.update({
      where: { id: subscriptionId },
      data: { lifecycleStatus: target },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteUnbilledDraftSubscriptionItem(
  subscriptionItemId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.subscriptionItem.findUnique({
      where: { id: subscriptionItemId },
      include: {
        _count: { select: { invoiceSnapshots: true, serviceAssignments: true } },
        successorItem: { select: { id: true } },
      },
    });
    if (!item) validation("ITEM_NOT_FOUND", "Subscription item not found.");
    await requireEditableSubscription(tx, item.customerSubscriptionId);
    if (item.status !== "draft") {
      validation("ITEM_NOT_DRAFT", "Only an unbilled draft item can be deleted.");
    }
    if (item._count.invoiceSnapshots > 0) {
      validation("ITEM_HAS_FINANCIAL_HISTORY", "Items with financial history cannot be deleted.");
    }
    if (item._count.serviceAssignments > 0 || item.predecessorItemId || item.successorItem) {
      validation("ITEM_HAS_HISTORY", "Items with assignment or transfer history cannot be deleted.");
    }
    await tx.subscriptionItem.delete({ where: { id: item.id } });
  });
}
