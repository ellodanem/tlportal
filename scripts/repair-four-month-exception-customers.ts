/**
 * Owner-run repair for two confirmed legacy exceptions (Howard Adrien and
 * Autozone Limited). It creates future-only canonical manual schedules; it
 * never creates an invoice, records a payment, talks to Stripe, or notifies a
 * customer. Run without --apply to verify the exact state first.
 */
import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../lib/db";
import { createDraftCanonicalSubscription } from "../lib/services/canonical-subscription-application-service";
import { activateCanonicalManualSubscription } from "../lib/services/canonical-subscription-activation-service";

const APPLY_CONFIRMATION = "APPLY_FOUR_MONTH_EXCEPTION_REPAIR";
const SNAPSHOT_CONFIRMATION = "NEON_SNAPSHOT_CONFIRMED";

type RepairSpec = {
  key: "howard" | "autozone";
  customerId: string;
  sourceInvoiceId: string;
  sourceInvoiceNumber: string;
  sourceInvoiceStatus: "open" | "paid";
  sourceInvoiceTotal: string;
  serviceSubtotal: string;
  commercialStartDate: string;
  nextBillingDate: string;
  name: string;
  reference: string;
  staleLegacySubscriptionId?: string;
  items: Array<{
    assignmentId: string;
    expectedImei: string;
    label: string;
    serviceActivatedDate: string;
    amountPerCycle: string;
  }>;
};

const REPAIRS: RepairSpec[] = [
  {
    key: "howard",
    customerId: "397d8778-3886-41a8-9e74-aab635e254d3",
    sourceInvoiceId: "dcdd303d-48cc-462a-8ea6-ae789c93a3e0",
    sourceInvoiceNumber: "TL-INV-100939",
    sourceInvoiceStatus: "open",
    sourceInvoiceTotal: "120.00",
    serviceSubtotal: "120.00",
    commercialStartDate: "2026-10-16",
    nextBillingDate: "2027-02-16",
    name: "Howard Adrien 4-month tracking service",
    reference: "legacy-repair-TL-INV-100939",
    staleLegacySubscriptionId: "3611fff3-b65c-4657-97e6-c92e86049454",
    items: [{
      assignmentId: "6112d41c-8d77-4fe6-a311-3e475a1e935f",
      expectedImei: "863874086233859",
      label: "GPS tracking service — 863874086233859",
      serviceActivatedDate: "2026-05-16",
      amountPerCycle: "120.00",
    }],
  },
  {
    key: "autozone",
    customerId: "9673afbf-6237-4619-b011-9b2995b5bc5e",
    sourceInvoiceId: "0a4a2294-69bd-4d16-af6c-8af0dfcd0885",
    sourceInvoiceNumber: "TL-INV-100916",
    sourceInvoiceStatus: "paid",
    sourceInvoiceTotal: "500.00",
    // The EC$300 hardware lines stay one-off history; only the EC$200 trial
    // line becomes a four-month recurring service agreement.
    serviceSubtotal: "200.00",
    commercialStartDate: "2026-08-24",
    nextBillingDate: "2026-12-24",
    name: "Autozone Limited 4-month tracking services",
    reference: "legacy-repair-TL-INV-100916",
    items: [
      {
        assignmentId: "2d1f626f-2dfe-4546-88b4-dccd869237fd",
        expectedImei: "868577072080797",
        label: "GPS tracking service — PJ1390 Honda CRV",
        serviceActivatedDate: "2026-08-24",
        amountPerCycle: "100.00",
      },
      {
        assignmentId: "bcfd9269-b3a7-4a92-b762-03c36a1e037d",
        expectedImei: "868577072080359",
        label: "GPS tracking service — PQ816 Toyota RAV4",
        serviceActivatedDate: "2026-08-24",
        amountPerCycle: "100.00",
      },
    ],
  },
];

function money(value: Prisma.Decimal | string | number) {
  return new Prisma.Decimal(value).toFixed(2);
}

function requireApplyAuthorization() {
  if (process.argv.includes("--apply") === false) return false;
  if (process.env.FOUR_MONTH_REPAIR_SNAPSHOT_CONFIRMED !== SNAPSHOT_CONFIRMATION) {
    throw new Error(`Create a fresh Neon recovery snapshot, then set FOUR_MONTH_REPAIR_SNAPSHOT_CONFIRMED=${SNAPSHOT_CONFIRMATION}.`);
  }
  if (process.env.FOUR_MONTH_REPAIR_CONFIRMATION !== APPLY_CONFIRMATION) {
    throw new Error(`Set FOUR_MONTH_REPAIR_CONFIRMATION=${APPLY_CONFIRMATION} to apply this exact repair.`);
  }
  if (process.env.CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED !== "true") {
    throw new Error("CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED=true is required to activate the future-only canonical schedules.");
  }
  return true;
}

async function loadRepairState(spec: RepairSpec) {
  const customer = await prisma.customer.findUnique({
    where: { id: spec.customerId },
    select: {
      id: true,
      archivedAt: true,
      serviceAssignments: {
        where: { id: { in: spec.items.map((item) => item.assignmentId) } },
        select: {
          id: true,
          status: true,
          endDate: true,
          intervalMonths: true,
          subscriptionItemId: true,
          device: { select: { imei: true } },
        },
      },
      customerSubscriptions: {
        where: { reference: spec.reference },
        select: {
          id: true,
          controlMode: true,
          lifecycleStatus: true,
          billingIntervalMonths: true,
          agreedAmountPerCycle: true,
          nextBillingDate: true,
          operationalActivation: { select: { id: true } },
          recurringSchedules: { select: { id: true, status: true, intervalMonths: true, nextIssueDate: true } },
        },
      },
    },
  });
  if (!customer || customer.archivedAt) throw new Error(`${spec.key}: expected an active customer.`);
  if (customer.serviceAssignments.length !== spec.items.length) throw new Error(`${spec.key}: expected exactly ${spec.items.length} configured service assignment(s).`);
  for (const item of spec.items) {
    const assignment = customer.serviceAssignments.find((candidate) => candidate.id === item.assignmentId);
    if (!assignment || assignment.device.imei !== item.expectedImei) throw new Error(`${spec.key}: a service assignment no longer matches the reviewed device.`);
    if (assignment.endDate || !["active", "due_soon", "overdue"].includes(assignment.status)) throw new Error(`${spec.key}: a reviewed assignment is no longer active.`);
    if (assignment.intervalMonths !== 3 && assignment.intervalMonths !== 4) throw new Error(`${spec.key}: assignment cadence must still be 3 or already repaired to 4 months.`);
  }
  if (customer.customerSubscriptions.length > 1) throw new Error(`${spec.key}: more than one prior repair subscription has this reference.`);

  const invoice = await prisma.invoice.findUnique({
    where: { id: spec.sourceInvoiceId },
    select: {
      id: true,
      customerId: true,
      number: true,
      status: true,
      migrationClassification: true,
      total: true,
      amountDue: true,
      customerSubscriptionId: true,
      recurringScheduleId: true,
      lineItems: { select: { description: true, lineTotal: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
  if (!invoice || invoice.customerId !== spec.customerId || invoice.number !== spec.sourceInvoiceNumber) throw new Error(`${spec.key}: the reviewed source invoice changed.`);
  if (invoice.status !== spec.sourceInvoiceStatus || money(invoice.total) !== spec.sourceInvoiceTotal) throw new Error(`${spec.key}: source invoice status or total changed.`);
  if (invoice.customerSubscriptionId || invoice.recurringScheduleId) throw new Error(`${spec.key}: source invoice was already linked to a different billing authority.`);
  if (spec.key === "howard" && invoice.migrationClassification !== "recurring_evidence") throw new Error("howard: source invoice is no longer classified as recurring evidence.");
  if (spec.key === "autozone" && !["unreviewed", "recurring_evidence"].includes(invoice.migrationClassification)) throw new Error("autozone: source invoice has a conflicting migration classification.");
  const reviewedServiceSubtotal = invoice.lineItems
    .filter((line) => /\b4\s*[- ]?\s*months?\b/i.test(line.description))
    .reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  if (money(reviewedServiceSubtotal) !== spec.serviceSubtotal) throw new Error(`${spec.key}: the explicitly four-month invoice lines no longer equal the reviewed recurring subtotal.`);

  if (spec.staleLegacySubscriptionId) {
    const legacy = await prisma.customerSubscription.findUnique({
      where: { id: spec.staleLegacySubscriptionId },
      select: { customerId: true, controlMode: true, status: true, planTermMonths: true, stripeSubscriptionId: true, invoices: { select: { id: true } } },
    });
    if (!legacy || legacy.customerId !== spec.customerId || legacy.controlMode !== "legacy" || legacy.planTermMonths !== 1 || legacy.stripeSubscriptionId || legacy.invoices.length) {
      throw new Error(`${spec.key}: the unused one-month legacy placeholder is no longer safe to retire.`);
    }
    if (legacy.status !== "pending_payment" && legacy.status !== "canceled") throw new Error(`${spec.key}: legacy placeholder has an unexpected status.`);
  }
  const existing = customer.customerSubscriptions[0];
  if (existing) {
    if (
      existing.controlMode !== "canonical"
      || existing.billingIntervalMonths !== 4
      || money(existing.agreedAmountPerCycle ?? 0) !== spec.serviceSubtotal
      || existing.nextBillingDate?.toISOString().slice(0, 10) !== spec.nextBillingDate
      || !["draft", "pending_activation", "active"].includes(existing.lifecycleStatus ?? "")
    ) throw new Error(`${spec.key}: existing repair subscription no longer matches the approved four-month terms.`);
    if (existing.operationalActivation && (existing.recurringSchedules.length !== 1 || existing.recurringSchedules[0]!.status !== "active" || existing.recurringSchedules[0]!.intervalMonths !== 4 || existing.recurringSchedules[0]!.nextIssueDate.toISOString().slice(0, 10) !== spec.nextBillingDate)) {
      throw new Error(`${spec.key}: existing canonical activation no longer has one expected future schedule.`);
    }
  }
  return { customer, invoice };
}

async function applyRepair(spec: RepairSpec, staffUser: { id: string; email: string }) {
  const before = {
    invoices: await prisma.invoice.count({ where: { customerId: spec.customerId } }),
    payments: await prisma.payment.count({ where: { customerId: spec.customerId } }),
  };
  const state = await loadRepairState(spec);
  const existingSubscription = state.customer.customerSubscriptions[0] ?? null;
  let subscriptionId = existingSubscription?.id ?? null;

  await prisma.$transaction(async (tx) => {
    for (const item of spec.items) {
      const updated = await tx.serviceAssignment.updateMany({
        where: { id: item.assignmentId, customerId: spec.customerId, intervalMonths: 3, subscriptionItemId: null },
        data: { intervalMonths: 4 },
      });
      if (updated.count === 0) {
        const current = await tx.serviceAssignment.findUnique({ where: { id: item.assignmentId }, select: { intervalMonths: true, subscriptionItemId: true } });
        if (!current || current.intervalMonths !== 4) throw new Error(`${spec.key}: assignment cadence changed during repair.`);
      }
    }
    if (spec.key === "autozone" && state.invoice.migrationClassification !== "recurring_evidence") {
      await tx.invoice.update({
        where: { id: spec.sourceInvoiceId },
        data: { migrationClassification: "recurring_evidence", migrationClassificationUpdatedAt: new Date() },
      });
      await tx.invoiceMigrationClassificationAudit.create({
        data: {
          invoiceId: spec.sourceInvoiceId,
          classification: "recurring_evidence",
          reason: "Owner-approved four-month exception repair: the EC$200 4 Month Trial lines are recurring-service evidence; EC$300 wired GPS hardware remains one-off history.",
          classifiedById: staffUser.id,
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!subscriptionId) {
    const subscription = await createDraftCanonicalSubscription({
      customerId: spec.customerId,
      name: spec.name,
      reference: spec.reference,
      billingIntervalMonths: 4,
      collectionMethod: "manual_invoice",
      currency: "XCD",
      defaultAgreedAmountPerCycle: spec.serviceSubtotal,
      commercialStartDate: spec.commercialStartDate,
      billingAnchorDate: spec.commercialStartDate,
      nextBillingDate: spec.nextBillingDate,
      gracePeriodDays: 7,
      controlMode: "canonical",
      items: spec.items.map((item) => ({
        label: item.label,
        serviceActivatedDate: item.serviceActivatedDate,
        billingEffectiveFrom: spec.commercialStartDate,
        rateEffectiveFrom: spec.commercialStartDate,
        agreedAmountPerCycle: item.amountPerCycle,
        rateClassification: "negotiated",
        rateChangeReason: "Owner-approved four-month legacy exception repair.",
        serviceAssignmentId: item.assignmentId,
        createdById: staffUser.id,
      })),
    });
    subscriptionId = subscription.id;
  }
  if (!subscriptionId) throw new Error(`${spec.key}: canonical subscription could not be prepared.`);

  const activation = await activateCanonicalManualSubscription({
    subscriptionId,
    staffUserId: staffUser.id,
    confirmationNote: `Owner-approved four-month exception repair from ${spec.sourceInvoiceNumber}. Existing invoice and payment history retained; future billing begins ${spec.nextBillingDate}.`,
    initialBilling: { mode: "deferred" },
    environment: {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED: process.env.CANONICAL_SUBSCRIPTION_OPERATIONS_ENABLED,
    },
  });

  await prisma.$transaction(async (tx) => {
    if (spec.staleLegacySubscriptionId) {
      await tx.customerSubscription.update({
        where: { id: spec.staleLegacySubscriptionId },
        data: { status: "canceled" },
      });
    }
    const existingLedger = await tx.canonicalMigrationLedger.findUnique({
      where: { sourceKind_sourceId: { sourceKind: "manual_invoice_exception", sourceId: spec.sourceInvoiceId } },
      select: { targetSubscriptionId: true },
    });
    if (existingLedger && existingLedger.targetSubscriptionId !== subscriptionId) throw new Error(`${spec.key}: existing audit ledger points to another subscription.`);
    if (!existingLedger) {
      const now = new Date();
      await tx.canonicalMigrationLedger.create({
        data: {
          migrationKey: `four-month-exception:${spec.sourceInvoiceId}`,
          sourceKind: "manual_invoice_exception",
          sourceId: spec.sourceInvoiceId,
          customerId: spec.customerId,
          sourceFingerprint: `invoice:${spec.sourceInvoiceId}:total:${spec.sourceInvoiceTotal}:recurring:${spec.serviceSubtotal}`,
          planFingerprint: `four-month-repair:${subscriptionId}:next:${spec.nextBillingDate}`,
          status: "completed",
          approvedPlan: {
            kind: "four_month_legacy_exception_repair",
            sourceInvoiceNumber: spec.sourceInvoiceNumber,
            serviceSubtotal: spec.serviceSubtotal,
            intervalMonths: 4,
            nextBillingDate: spec.nextBillingDate,
            assignmentIds: spec.items.map((item) => item.assignmentId),
          },
          approvedBy: staffUser.email,
          approvalReason: "Owner-authorized repair of an established four-month legacy arrangement; source invoice and all payment history are preserved.",
          approvedAt: now,
          targetSubscriptionId: subscriptionId,
          startedAt: now,
          completedAt: now,
          reconciliation: { initialInvoiceCreated: false, paymentCreated: false, providerOperation: false, notificationSent: false },
        },
      });
    }
    await tx.operationalEvent.create({
      data: {
        customerId: spec.customerId,
        actorUserId: staffUser.id,
        category: "billing",
        summary: `Repaired four-month legacy billing cadence and activated future canonical schedule from ${spec.sourceInvoiceNumber}.`,
        payload: { subscriptionId, sourceInvoiceId: spec.sourceInvoiceId, nextBillingDate: spec.nextBillingDate },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const after = {
    invoices: await prisma.invoice.count({ where: { customerId: spec.customerId } }),
    payments: await prisma.payment.count({ where: { customerId: spec.customerId } }),
  };
  if (before.invoices !== after.invoices || before.payments !== after.payments || activation.initialInvoiceId) {
    throw new Error(`${spec.key}: unexpected financial side effect detected; stop and reconcile immediately.`);
  }
  return { subscriptionId, scheduleId: activation.scheduleId, nextBillingDate: spec.nextBillingDate, invoiceCountChanged: false, paymentCountChanged: false };
}

async function main() {
  const apply = requireApplyAuthorization();
  const states = await Promise.all(REPAIRS.map(async (spec) => ({ spec, state: await loadRepairState(spec) })));
  if (!apply) {
    console.log(JSON.stringify({
      dryRun: true,
      repairs: states.map(({ spec, state }) => ({
        customer: spec.key,
        sourceInvoice: spec.sourceInvoiceNumber,
        sourceInvoiceStatus: state.invoice.status,
        sourceInvoiceTotal: money(state.invoice.total),
        recurringServiceSubtotal: spec.serviceSubtotal,
        repairedCadence: "4 months",
        futureCanonicalRenewal: spec.nextBillingDate,
      })),
    }, null, 2));
    return;
  }
  const approvedByEmail = process.env.FOUR_MONTH_REPAIR_APPROVED_BY_EMAIL?.trim().toLowerCase();
  if (!approvedByEmail) throw new Error("FOUR_MONTH_REPAIR_APPROVED_BY_EMAIL must identify the staff member approving this repair.");
  const staffUser = await prisma.user.findUnique({ where: { email: approvedByEmail }, select: { id: true, email: true } });
  if (!staffUser) throw new Error("The approving staff user was not found.");
  const results = [];
  for (const spec of REPAIRS) results.push({ customer: spec.key, ...await applyRepair(spec, staffUser) });
  console.log(JSON.stringify({ applied: true, results }, null, 2));
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
