import "server-only";

import { Prisma, type CanonicalMigrationStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  assertCanonicalMigrationPlanIntegrity,
  migrationFingerprint,
  proposalSourceFingerprint,
  type CanonicalMigrationPlan,
  type CanonicalMigrationPlanEntry,
} from "@/lib/domain/canonical-subscription-migration";
import { analyzeSubscriptionMigration } from "@/lib/domain/subscription-migration-analysis";
import { loadLegacyBillingSnapshot } from "@/lib/services/subscription-migration-analysis-service";

export const APPLY_MIGRATION_CONFIRMATION = "APPLY_SHADOW_CANONICAL_MIGRATION" as const;
export const REVERSE_MIGRATION_CONFIRMATION = "REVERSE_UNUSED_SHADOW_MIGRATION" as const;

export type MigrationExecutionEnvironment = {
  NODE_ENV?: string;
  VERCEL?: string;
  DATABASE_URL?: string;
  ALLOW_CANONICAL_MIGRATION_EXECUTION?: string;
};

export type MigrationExecutionOptions = {
  execute: true;
  confirmation: typeof APPLY_MIGRATION_CONFIRMATION;
  environment?: MigrationExecutionEnvironment;
};

export type MigrationReversalOptions = {
  execute: true;
  confirmation: typeof REVERSE_MIGRATION_CONFIRMATION;
  environment?: MigrationExecutionEnvironment;
};

export type MigrationReconciliation = {
  migrationKey: string;
  customerId: string;
  targetSubscriptionId: string;
  customerOwnershipMatches: boolean;
  subscriptionCount: { expected: number; actual: number };
  itemCount: { expected: number; actual: number };
  assignmentCount: { expected: number; actual: number };
  rateCount: { expected: number; actual: number };
  expectedTotalAmountPerCycle: string;
  actualTotalAmountPerCycle: string;
  billingIntervalMonths: { expected: number; actual: number | null };
  billingAnchorDate: { expected: string; actual: string | null };
  nextBillingDate: { expected: string; actual: string | null };
  providerReference: { expected: string | null; actual: string | null };
  providerItems: {
    expectedCount: number;
    actualCount: number;
    matched: boolean;
  };
  legacySideEffects: {
    invoicesChanged: boolean;
    billingInvoicesChanged: boolean;
    paymentsChanged: boolean;
    recurringSchedulesChanged: boolean;
    billingOperationsChanged: boolean;
  };
  matched: boolean;
};

export type MigrationExecutionResult = {
  planFingerprint: string;
  entries: Array<{
    migrationKey: string;
    ledgerId: string;
    status: CanonicalMigrationStatus;
    targetSubscriptionId: string | null;
    alreadyApplied: boolean;
    reconciliation: MigrationReconciliation | null;
  }>;
};

export type MigrationReversalResult = {
  migrationKey: string;
  ledgerId: string;
  status: "reversed";
  reversedSubscriptionId: string;
  clearedAssignmentIds: string[];
};

export class CanonicalMigrationExecutionError extends Error {
  readonly code: string;
  readonly migrationKey: string | null;

  constructor(code: string, message: string, migrationKey?: string) {
    super(message);
    this.name = "CanonicalMigrationExecutionError";
    this.code = code;
    this.migrationKey = migrationKey ?? null;
  }
}

function executionError(code: string, message: string, migrationKey?: string): never {
  throw new CanonicalMigrationExecutionError(code, message, migrationKey);
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
}

export function assertLocalMigrationExecutionGuard(
  input: {
    execute: boolean;
    confirmation: string;
    expectedConfirmation: string;
    environment?: MigrationExecutionEnvironment;
  },
): void {
  const environment = input.environment ?? process.env;
  if (!input.execute || input.confirmation !== input.expectedConfirmation) {
    executionError(
      "EXPLICIT_EXECUTION_REQUIRED",
      "Migration execution requires the exact explicit confirmation token.",
    );
  }
  if (environment.ALLOW_CANONICAL_MIGRATION_EXECUTION !== "true") {
    executionError(
      "LOCAL_EXECUTION_NOT_ENABLED",
      "Set ALLOW_CANONICAL_MIGRATION_EXECUTION=true only in an isolated local/test process.",
    );
  }
  if (environment.NODE_ENV === "production" || environment.VERCEL) {
    executionError(
      "PRODUCTION_EXECUTION_BLOCKED",
      "Canonical migration execution is blocked in production and Vercel environments.",
    );
  }
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) executionError("DATABASE_URL_REQUIRED", "A disposable local/test DATABASE_URL is required.");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    executionError("DATABASE_URL_INVALID", "DATABASE_URL is not a valid URL.");
  }
  const host = parsed.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    executionError(
      "REMOTE_DATABASE_BLOCKED",
      "Migration execution accepts only a localhost PostgreSQL host.",
    );
  }
  const name = databaseName(parsed);
  if (!name.includes("test") && !name.includes("local") && !name.includes("dev")) {
    executionError(
      "NON_TEST_DATABASE_BLOCKED",
      "The local database name must explicitly contain test, local, or dev.",
    );
  }
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode === "require" || sslMode === "verify-full" || sslMode === "verify-ca") {
    executionError(
      "REMOTE_DATABASE_BLOCKED",
      "TLS-required database URLs are not accepted by the local migration executor.",
    );
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function lifecycleLegacyStatus(
  lifecycle: CanonicalMigrationPlanEntry["target"]["lifecycleStatus"],
): "pending_payment" | "active" | "paused" | "canceled" {
  switch (lifecycle) {
    case "active": return "active";
    case "paused": return "paused";
    case "canceled":
    case "ended": return "canceled";
    case "draft":
    case "pending_activation": return "pending_payment";
  }
}

function lifecycleItemStatus(
  lifecycle: CanonicalMigrationPlanEntry["target"]["lifecycleStatus"],
): "draft" | "pending_activation" | "active" | "paused" | "ended" | "canceled" {
  return lifecycle;
}

type SideEffectCounts = {
  invoices: number;
  billingInvoices: number;
  payments: number;
  recurringSchedules: number;
  billingOperations: number;
};

async function sideEffectCounts(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<SideEffectCounts> {
  const [invoices, billingInvoices, payments, recurringSchedules, billingOperations] = await Promise.all([
    tx.invoice.count({ where: { customerId } }),
    tx.billingInvoice.count({ where: { customerId } }),
    tx.payment.count({ where: { customerId } }),
    tx.recurringInvoiceSchedule.count({ where: { customerId } }),
    tx.billingOperation.count({ where: { customerId } }),
  ]);
  return { invoices, billingInvoices, payments, recurringSchedules, billingOperations };
}

function commercialDate(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

async function reconcileEntry(
  tx: Prisma.TransactionClient,
  entry: CanonicalMigrationPlanEntry,
  targetSubscriptionId: string,
  before: SideEffectCounts,
): Promise<MigrationReconciliation> {
  const target = await tx.customerSubscription.findUniqueOrThrow({
    where: { id: targetSubscriptionId },
    include: {
      items: {
        include: {
          rates: true,
          serviceAssignments: { select: { id: true } },
        },
      },
      providerLinks: { include: { providerItems: true } },
    },
  });
  const after = await sideEffectCounts(tx, entry.customerId);
  const actualAssignments = target.items.flatMap((item) => item.serviceAssignments.map((row) => row.id));
  const expectedAssignments = entry.target.items.flatMap((item) => item.assignmentIds);
  const rates = target.items.flatMap((item) => item.rates);
  const totalCents = rates.reduce((total, rate) =>
    total + Math.round(Number(rate.agreedAmountPerCycle) * 100), 0);
  const actualTotal = `${Math.floor(totalCents / 100)}.${String(totalCents % 100).padStart(2, "0")}`;
  const providerActual = target.providerLinks[0]?.externalSubscriptionId ?? null;
  const providerExpected = entry.target.providerRelationship?.externalSubscriptionId ?? null;
  const expectedProviderItems = (entry.target.providerRelationship?.providerItems ?? [])
    .map((item) => [
      item.externalSubscriptionItemId,
      item.externalPriceId,
      item.agreedAmountPerCycle,
      String(item.quantity),
      item.rateGroupFingerprint,
    ].join("\u0000"))
    .sort();
  const actualProviderItems = target.providerLinks
    .flatMap((link) => link.providerItems)
    .map((item) => [
      item.externalSubscriptionItemId,
      item.externalPriceId,
      item.agreedAmountPerCycle.toFixed(2),
      String(item.quantity),
      item.rateGroupFingerprint,
    ].join("\u0000"))
    .sort();
  const providerItemsMatched = expectedProviderItems.length === actualProviderItems.length
    && expectedProviderItems.every((value, index) => value === actualProviderItems[index]);
  const legacySideEffects = {
    invoicesChanged: before.invoices !== after.invoices,
    billingInvoicesChanged: before.billingInvoices !== after.billingInvoices,
    paymentsChanged: before.payments !== after.payments,
    recurringSchedulesChanged: before.recurringSchedules !== after.recurringSchedules,
    billingOperationsChanged: before.billingOperations !== after.billingOperations,
  };
  const reconciliation: MigrationReconciliation = {
    migrationKey: entry.migrationKey,
    customerId: entry.customerId,
    targetSubscriptionId,
    customerOwnershipMatches: target.customerId === entry.customerId,
    subscriptionCount: { expected: 1, actual: 1 },
    itemCount: { expected: entry.target.items.length, actual: target.items.length },
    assignmentCount: { expected: expectedAssignments.length, actual: actualAssignments.length },
    rateCount: { expected: entry.target.items.length, actual: rates.length },
    expectedTotalAmountPerCycle: entry.target.expectedTotalAmountPerCycle,
    actualTotalAmountPerCycle: actualTotal,
    billingIntervalMonths: {
      expected: entry.target.billingIntervalMonths,
      actual: target.billingIntervalMonths,
    },
    billingAnchorDate: {
      expected: entry.target.billingAnchorDate,
      actual: commercialDate(target.billingAnchorDate),
    },
    nextBillingDate: {
      expected: entry.target.nextBillingDate,
      actual: commercialDate(target.nextBillingDate),
    },
    providerReference: { expected: providerExpected, actual: providerActual },
    providerItems: {
      expectedCount: expectedProviderItems.length,
      actualCount: actualProviderItems.length,
      matched: providerItemsMatched,
    },
    legacySideEffects,
    matched: false,
  };
  reconciliation.matched = reconciliation.customerOwnershipMatches
    && target.controlMode === "shadow"
    && reconciliation.itemCount.expected === reconciliation.itemCount.actual
    && reconciliation.assignmentCount.expected === reconciliation.assignmentCount.actual
    && new Set(actualAssignments).size === new Set(expectedAssignments).size
    && expectedAssignments.every((id) => actualAssignments.includes(id))
    && reconciliation.rateCount.expected === reconciliation.rateCount.actual
    && reconciliation.expectedTotalAmountPerCycle === reconciliation.actualTotalAmountPerCycle
    && reconciliation.billingIntervalMonths.expected === reconciliation.billingIntervalMonths.actual
    && reconciliation.billingAnchorDate.expected === reconciliation.billingAnchorDate.actual
    && reconciliation.nextBillingDate.expected === reconciliation.nextBillingDate.actual
    && reconciliation.providerReference.expected === reconciliation.providerReference.actual
    && reconciliation.providerItems.matched
    && !Object.values(legacySideEffects).some(Boolean);
  return reconciliation;
}

async function registerApprovedLedgers(plan: CanonicalMigrationPlan): Promise<void> {
  for (const entry of plan.entries) {
    const entryFingerprint = migrationFingerprint(entry);
    try {
      await prisma.canonicalMigrationLedger.create({
        data: {
          migrationKey: entry.migrationKey,
          sourceKind: entry.sourceKind,
          sourceId: entry.sourceId,
          customerId: entry.customerId,
          sourceFingerprint: entry.sourceFingerprint,
          planFingerprint: entryFingerprint,
          status: "approved",
          approvedPlan: jsonValue(entry),
          approvedBy: entry.approvedBy,
          approvalReason: entry.approvalReason,
          approvedAt: new Date(entry.approvedAt),
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const existing = await prisma.canonicalMigrationLedger.findUnique({
        where: { migrationKey: entry.migrationKey },
      });
      if (!existing || existing.planFingerprint !== entryFingerprint) {
        executionError(
          "MIGRATION_APPROVAL_CONFLICT",
          "This source arrangement already has a different approved migration plan.",
          entry.migrationKey,
        );
      }
    }
  }
}

async function markSourceNeedsReview(
  entries: CanonicalMigrationPlanEntry[],
  message: string,
): Promise<void> {
  await prisma.canonicalMigrationLedger.updateMany({
    where: { migrationKey: { in: entries.map((entry) => entry.migrationKey) }, status: { not: "completed" } },
    data: {
      status: "needs_review",
      failedAt: new Date(),
      failureCode: "SOURCE_FINGERPRINT_MISMATCH",
      failureMessage: message,
    },
  });
}

async function verifyCurrentSources(plan: CanonicalMigrationPlan, entries: CanonicalMigrationPlanEntry[]): Promise<void> {
  if (!entries.length) return;
  const currentSnapshot = await loadLegacyBillingSnapshot(plan.analysisDate);
  const currentAnalysis = analyzeSubscriptionMigration(currentSnapshot);
  for (const entry of entries) {
    let currentFingerprint: string;
    try {
      currentFingerprint = proposalSourceFingerprint(currentSnapshot, currentAnalysis, entry.proposalId);
    } catch {
      await markSourceNeedsReview(entries, `Source proposal ${entry.proposalId} no longer exists.`);
      executionError(
        "SOURCE_CHANGED_AFTER_APPROVAL",
        "An approved source arrangement no longer exists. Regenerate the plan.",
        entry.migrationKey,
      );
    }
    if (currentFingerprint !== entry.sourceFingerprint) {
      await markSourceNeedsReview(entries, `Source proposal ${entry.proposalId} changed after approval.`);
      executionError(
        "SOURCE_CHANGED_AFTER_APPROVAL",
        "Source records changed after approval. Regenerate and review the plan.",
        entry.migrationKey,
      );
    }
  }
}

async function executePlanTransaction(
  plan: CanonicalMigrationPlan,
): Promise<MigrationExecutionResult> {
  return prisma.$transaction(async (tx) => {
    const keys = plan.entries.map((entry) => entry.migrationKey).sort();
    if (keys.length) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "CanonicalMigrationLedger"
        WHERE "migrationKey" IN (${Prisma.join(keys)})
        ORDER BY "migrationKey"
        FOR UPDATE
      `);
    }
    const ledgers = await tx.canonicalMigrationLedger.findMany({
      where: { migrationKey: { in: keys } },
      orderBy: { migrationKey: "asc" },
    });
    const ledgerByKey = new Map(ledgers.map((entry) => [entry.migrationKey, entry]));
    const results: MigrationExecutionResult["entries"] = [];

    for (const entry of plan.entries) {
      const ledger = ledgerByKey.get(entry.migrationKey);
      if (!ledger) executionError("MIGRATION_LEDGER_MISSING", "Approved migration ledger is missing.", entry.migrationKey);
      if (ledger.planFingerprint !== migrationFingerprint(entry)) {
        executionError("MIGRATION_APPROVAL_CONFLICT", "Approved migration plan fingerprint differs.", entry.migrationKey);
      }
      if (ledger.status === "completed") {
        results.push({
          migrationKey: entry.migrationKey,
          ledgerId: ledger.id,
          status: ledger.status,
          targetSubscriptionId: ledger.targetSubscriptionId,
          alreadyApplied: true,
          reconciliation: ledger.reconciliation as MigrationReconciliation | null,
        });
        continue;
      }
      if (ledger.status === "reversed") {
        executionError(
          "MIGRATION_ALREADY_REVERSED",
          "A reversed migration requires a new reviewed approval before it can be applied again.",
          entry.migrationKey,
        );
      }
      if (ledger.targetSubscriptionId) {
        executionError(
          "PARTIAL_MIGRATION_REQUIRES_REVIEW",
          "A non-completed migration already references a target subscription.",
          entry.migrationKey,
        );
      }

      await tx.canonicalMigrationLedger.update({
        where: { id: ledger.id },
        data: {
          status: "in_progress",
          startedAt: new Date(),
          failedAt: null,
          failureCode: null,
          failureMessage: null,
        },
      });
      const assignmentIds = entry.target.items.flatMap((item) => item.assignmentIds).sort();
      if (assignmentIds.length) {
        const lockedAssignments = await tx.$queryRaw<Array<{ id: string; subscriptionItemId: string | null }>>(
          Prisma.sql`
            SELECT "id", "subscriptionItemId" FROM "ServiceAssignment"
            WHERE "id" IN (${Prisma.join(assignmentIds)})
            ORDER BY "id"
            FOR UPDATE
          `,
        );
        if (lockedAssignments.length !== assignmentIds.length) {
          executionError("ASSIGNMENT_MISSING", "One or more approved assignments no longer exist.", entry.migrationKey);
        }
        if (lockedAssignments.some((assignment) => assignment.subscriptionItemId != null)) {
          executionError(
            "ASSIGNMENT_ALREADY_CANONICAL",
            "An approved assignment is already linked to a canonical item.",
            entry.migrationKey,
          );
        }
      }

      const before = await sideEffectCounts(tx, entry.customerId);
      const target = await tx.customerSubscription.create({
        data: {
          customerId: entry.customerId,
          name: entry.target.name,
          reference: entry.target.reference,
          collectionMethod: entry.target.collectionMethod,
          lifecycleStatus: entry.target.lifecycleStatus,
          billingIntervalMonths: entry.target.billingIntervalMonths,
          currency: entry.target.currency,
          agreedAmountPerCycle: entry.target.defaultItemAmountPerCycle,
          commercialStartDate: dateOnly(entry.target.commercialStartDate),
          billingAnchorDate: dateOnly(entry.target.billingAnchorDate),
          nextBillingDate: dateOnly(entry.target.nextBillingDate),
          gracePeriodDays: entry.target.gracePeriodDays,
          controlMode: "shadow",
          status: lifecycleLegacyStatus(entry.target.lifecycleStatus),
          planTermMonths: entry.target.billingIntervalMonths,
          vehicleCount: entry.target.items.length,
        },
        select: { id: true },
      });

      for (const itemPlan of entry.target.items) {
        const item = await tx.subscriptionItem.create({
          data: {
            customerSubscriptionId: target.id,
            label: itemPlan.label,
            status: lifecycleItemStatus(entry.target.lifecycleStatus),
            serviceActivatedDate: dateOnly(itemPlan.serviceActivatedDate),
            billingEffectiveFrom: dateOnly(itemPlan.billingEffectiveFrom),
            billingEffectiveUntil: itemPlan.billingEffectiveUntil
              ? dateOnly(itemPlan.billingEffectiveUntil)
              : null,
            notes: `Phase 2B migration ${entry.migrationKey}; item key ${itemPlan.itemKey}`,
            rates: {
              create: {
                billingIntervalMonths: entry.target.billingIntervalMonths,
                agreedAmountPerCycle: itemPlan.agreedAmountPerCycle,
                currency: entry.target.currency,
                effectiveFrom: dateOnly(itemPlan.billingEffectiveFrom),
                effectiveUntil: itemPlan.billingEffectiveUntil
                  ? dateOnly(itemPlan.billingEffectiveUntil)
                  : null,
                classification: itemPlan.classification,
                changeReason: itemPlan.changeReason,
              },
            },
          },
          select: { id: true },
        });
        await tx.serviceAssignment.updateMany({
          where: {
            id: { in: itemPlan.assignmentIds },
            customerId: entry.customerId,
            subscriptionItemId: null,
          },
          data: { subscriptionItemId: item.id },
        });
      }

      if (entry.target.providerRelationship) {
        const provider = entry.target.providerRelationship;
        const link = await tx.subscriptionProviderLink.create({
          data: {
            customerSubscriptionId: target.id,
            provider: provider.provider,
            externalSubscriptionId: provider.externalSubscriptionId,
            providerStatus: provider.providerStatus,
            activatedAt: new Date(provider.activatedAt),
            metadata: jsonValue({
              migratedBy: "phase-2b",
              migrationKey: entry.migrationKey,
              sourceKind: entry.sourceKind,
              sourceId: entry.sourceId,
            }),
          },
          select: { id: true },
        });
        for (const providerItem of provider.providerItems) {
          await tx.subscriptionProviderItem.create({
            data: {
              subscriptionProviderLinkId: link.id,
              externalSubscriptionItemId: providerItem.externalSubscriptionItemId,
              externalPriceId: providerItem.externalPriceId,
              currency: entry.target.currency,
              billingIntervalMonths: entry.target.billingIntervalMonths,
              agreedAmountPerCycle: providerItem.agreedAmountPerCycle,
              quantity: providerItem.quantity,
              rateGroupFingerprint: providerItem.rateGroupFingerprint,
            },
          });
        }
      }

      const reconciliation = await reconcileEntry(tx, entry, target.id, before);
      if (!reconciliation.matched) {
        executionError(
          "POST_MIGRATION_RECONCILIATION_FAILED",
          "Canonical records did not reconcile to the approved plan; the transaction was rolled back.",
          entry.migrationKey,
        );
      }
      const completed = await tx.canonicalMigrationLedger.update({
        where: { id: ledger.id },
        data: {
          status: "completed",
          targetSubscriptionId: target.id,
          completedAt: new Date(),
          reconciliation: jsonValue(reconciliation),
        },
      });
      results.push({
        migrationKey: entry.migrationKey,
        ledgerId: completed.id,
        status: completed.status,
        targetSubscriptionId: target.id,
        alreadyApplied: false,
        reconciliation,
      });
    }
    return { planFingerprint: plan.planFingerprint, entries: results };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  return error.code === "P2010" && error.meta?.code === "40001";
}

async function runWithSerializableRetry(plan: CanonicalMigrationPlan): Promise<MigrationExecutionResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await executePlanTransaction(plan);
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error)) throw error;
    }
  }
  throw lastError;
}

export async function executeCanonicalMigrationPlan(
  plan: CanonicalMigrationPlan,
  options: MigrationExecutionOptions,
): Promise<MigrationExecutionResult> {
  assertLocalMigrationExecutionGuard({
    execute: options.execute,
    confirmation: options.confirmation,
    expectedConfirmation: APPLY_MIGRATION_CONFIRMATION,
    environment: options.environment,
  });
  assertCanonicalMigrationPlanIntegrity(plan);
  if (!plan.entries.length) executionError("NO_APPROVED_ENTRIES", "The plan contains no approved entries.");
  await registerApprovedLedgers(plan);
  const ledgers = await prisma.canonicalMigrationLedger.findMany({
    where: { migrationKey: { in: plan.entries.map((entry) => entry.migrationKey) } },
  });
  const completedKeys = new Set(ledgers
    .filter((entry) => entry.status === "completed")
    .map((entry) => entry.migrationKey));
  await verifyCurrentSources(
    plan,
    plan.entries.filter((entry) => !completedKeys.has(entry.migrationKey)),
  );
  try {
    return await runWithSerializableRetry(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CanonicalMigrationExecutionError
      ? error.code
      : "MIGRATION_TRANSACTION_FAILED";
    await prisma.canonicalMigrationLedger.updateMany({
      where: {
        migrationKey: { in: plan.entries.map((entry) => entry.migrationKey) },
        status: { in: ["approved", "in_progress", "failed_rolled_back"] },
        targetSubscriptionId: null,
      },
      data: {
        status: "failed_rolled_back",
        failedAt: new Date(),
        failureCode: code,
        failureMessage: message.slice(0, 10_000),
      },
    });
    throw error;
  }
}

export async function reverseCanonicalMigration(
  migrationKey: string,
  options: MigrationReversalOptions,
): Promise<MigrationReversalResult> {
  assertLocalMigrationExecutionGuard({
    execute: options.execute,
    confirmation: options.confirmation,
    expectedConfirmation: REVERSE_MIGRATION_CONFIRMATION,
    environment: options.environment,
  });
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "CanonicalMigrationLedger"
        WHERE "migrationKey" = ${migrationKey}
        FOR UPDATE
      `);
      const ledger = await tx.canonicalMigrationLedger.findUnique({ where: { migrationKey } });
      if (!ledger) executionError("MIGRATION_NOT_FOUND", "Migration ledger not found.", migrationKey);
      if (ledger.status === "reversed") {
        executionError("MIGRATION_ALREADY_REVERSED", "Migration is already reversed.", migrationKey);
      }
      if (ledger.status !== "completed" || !ledger.targetSubscriptionId) {
        executionError(
          "MIGRATION_NOT_REVERSIBLE",
          "Only a completed migration with a shadow target can be reversed.",
          migrationKey,
        );
      }
      const target = await tx.customerSubscription.findUnique({
        where: { id: ledger.targetSubscriptionId },
        include: {
          items: {
            select: {
              id: true,
              updatedAt: true,
              rates: { select: { id: true, updatedAt: true } },
              serviceAssignments: { select: { id: true, updatedAt: true } },
            },
          },
          providerLinks: {
            select: {
              id: true,
              updatedAt: true,
              endedAt: true,
              lastSyncedAt: true,
              lastError: true,
              providerItems: { select: { id: true, updatedAt: true, lastSyncedAt: true } },
            },
          },
        },
      });
      if (!target || target.controlMode !== "shadow") {
        executionError(
          "MIGRATION_NOT_REVERSIBLE",
          "The migration target is absent or no longer in shadow mode.",
          migrationKey,
        );
      }
      const itemIds = target.items.map((entry) => entry.id);
      const providerLinkIds = target.providerLinks.map((entry) => entry.id);
      const approvedPlan = ledger.approvedPlan as unknown as CanonicalMigrationPlanEntry;
      const expectedAssignmentIds = approvedPlan.target?.items
        ?.flatMap((item) => item.assignmentIds)
        .sort() ?? [];
      const assignments = target.items
        .flatMap((item) => item.serviceAssignments)
        .sort((left, right) => left.id.localeCompare(right.id));
      const actualAssignmentIds = assignments.map((entry) => entry.id);
      const expectedProviderLinkCount = approvedPlan.target?.providerRelationship ? 1 : 0;
      const expectedProviderItemCount = approvedPlan.target?.providerRelationship?.providerItems.length ?? 0;
      const actualRates = target.items.flatMap((item) => item.rates);
      const actualProviderItems = target.providerLinks.flatMap((link) => link.providerItems);
      const completedAt = ledger.completedAt?.getTime() ?? 0;
      const postMigrationActivity = [
        target.updatedAt,
        ...target.items.map((item) => item.updatedAt),
        ...actualRates.map((rate) => rate.updatedAt),
        ...assignments.map((assignment) => assignment.updatedAt),
        ...target.providerLinks.map((link) => link.updatedAt),
        ...actualProviderItems.map((item) => item.updatedAt),
      ].some((updatedAt) => updatedAt.getTime() > completedAt)
        || target.providerLinks.some((link) =>
          link.endedAt != null || link.lastSyncedAt != null || link.lastError != null)
        || actualProviderItems.some((item) => item.lastSyncedAt != null);
      const structureChanged = migrationFingerprint(approvedPlan) !== ledger.planFingerprint
        || target.items.length !== approvedPlan.target?.items?.length
        || actualRates.length !== approvedPlan.target?.items?.length
        || target.providerLinks.length !== expectedProviderLinkCount
        || actualProviderItems.length !== expectedProviderItemCount
        || actualAssignmentIds.length !== expectedAssignmentIds.length
        || actualAssignmentIds.some((id, index) => id !== expectedAssignmentIds[index]);
      if (postMigrationActivity || structureChanged) {
        executionError(
          "REVERSAL_REQUIRES_MANUAL_REVIEW",
          "The shadow migration has changed structure or post-migration operational activity and cannot be deleted automatically.",
          migrationKey,
        );
      }
      const [
        invoices,
        billingInvoices,
        schedules,
        operations,
        snapshots,
        providerInvoices,
      ] = await Promise.all([
        tx.invoice.count({ where: { customerSubscriptionId: target.id } }),
        tx.billingInvoice.count({ where: { customerSubscriptionId: target.id } }),
        tx.recurringInvoiceSchedule.count({ where: { customerSubscriptionId: target.id } }),
        tx.billingOperation.count({ where: { customerSubscriptionId: target.id } }),
        tx.invoiceServiceSnapshot.count({ where: { subscriptionItemId: { in: itemIds } } }),
        tx.billingInvoice.count({ where: { subscriptionProviderLinkId: { in: providerLinkIds } } }),
      ]);
      if ([invoices, billingInvoices, schedules, operations, snapshots, providerInvoices].some((count) => count > 0)) {
        executionError(
          "REVERSAL_REQUIRES_MANUAL_REVIEW",
          "The shadow migration has financial or operational history and cannot be deleted automatically.",
          migrationKey,
        );
      }
      await tx.serviceAssignment.updateMany({
        where: { subscriptionItemId: { in: itemIds } },
        data: { subscriptionItemId: null },
      });
      await tx.subscriptionProviderItem.deleteMany({
        where: { subscriptionProviderLinkId: { in: providerLinkIds } },
      });
      await tx.subscriptionProviderLink.deleteMany({ where: { id: { in: providerLinkIds } } });
      await tx.subscriptionItemRate.deleteMany({ where: { subscriptionItemId: { in: itemIds } } });
      await tx.subscriptionItem.deleteMany({ where: { id: { in: itemIds } } });
      await tx.canonicalMigrationLedger.update({
        where: { id: ledger.id },
        data: {
          status: "reversed",
          targetSubscriptionId: null,
          reversedAt: new Date(),
          reconciliation: jsonValue({
            reversal: "completed",
            reversedSubscriptionId: target.id,
            clearedAssignmentIds: assignments.map((entry) => entry.id),
          }),
        },
      });
      await tx.customerSubscription.delete({ where: { id: target.id } });
      return {
        migrationKey,
        ledgerId: ledger.id,
        status: "reversed" as const,
        reversedSubscriptionId: target.id,
        clearedAssignmentIds: assignments.map((entry) => entry.id),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (
      error instanceof CanonicalMigrationExecutionError
      && error.code === "REVERSAL_REQUIRES_MANUAL_REVIEW"
    ) {
      await prisma.canonicalMigrationLedger.updateMany({
        where: { migrationKey, status: "completed" },
        data: {
          status: "needs_review",
          failureCode: error.code,
          failureMessage: error.message,
          failedAt: new Date(),
        },
      });
    }
    throw error;
  }
}
