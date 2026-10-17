"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import {
  canonicalManualPilotProposalFingerprint,
  signCanonicalManualPilotAuthorization,
  type CanonicalManualPilotAuthorization,
} from "@/lib/domain/canonical-manual-pilot";
import { assertCanonicalSubscriptionUiEnabled } from "@/lib/domain/canonical-subscription-admin";
import {
  ACTIVATE_MANUAL_PILOT_CONFIRMATION,
  activateCanonicalManualPilot,
  getCanonicalManualPilotReview,
} from "@/lib/services/canonical-manual-pilot-service";
import { buildCanonicalManualPilotMigrationPlan } from "@/lib/services/canonical-manual-pilot-review-service";
import {
  APPLY_MIGRATION_CONFIRMATION,
  executeCanonicalMigrationPlan,
} from "@/lib/services/canonical-subscription-migration-service";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

async function requireLocalStaff() {
  assertCanonicalSubscriptionUiEnabled();
  const session = await getSession();
  if (!session) throw new Error("You must be signed in.");
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw new Error("The signed-in staff account no longer exists.");
  return user;
}

function errorDestination(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "The pilot operation failed.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function migrateManualPilotShadowAction(formData: FormData): Promise<void> {
  const proposalId = text(formData, "proposalId");
  const returnPath = `/admin/subscriptions/canonical/pilot/${encodeURIComponent(proposalId)}`;
  let targetSubscriptionId: string;
  try {
    const user = await requireLocalStaff();
    const assignmentIds = formData.getAll("assignmentId").map(String);
    const nextBillingDate = text(formData, "nextBillingDate");
    const approvalReason = text(formData, "approvalReason");
    const plan = await buildCanonicalManualPilotMigrationPlan({
      proposalId,
      approvedBy: user.email,
      approvedAt: new Date().toISOString(),
      approvalReason,
      name: text(formData, "name"),
      reference: text(formData, "reference"),
      commercialStartDate: text(formData, "commercialStartDate"),
      billingAnchorDate: text(formData, "billingAnchorDate"),
      nextBillingDate,
      sourceCoverageStartDate: text(formData, "sourceCoverageStartDate") || undefined,
      sourceCoverageEndDate: text(formData, "sourceCoverageEndDate") || undefined,
      gracePeriodDays: Number(text(formData, "gracePeriodDays")),
      items: assignmentIds.map((assignmentId) => ({
        assignmentId,
        label: text(formData, `label:${assignmentId}`),
        agreedAmountPerCycle: text(formData, `amount:${assignmentId}`),
        classification: text(formData, `classification:${assignmentId}`) === "negotiated"
          ? "negotiated"
          : "standard",
      })),
    });
    const result = await executeCanonicalMigrationPlan(plan, {
      execute: true,
      confirmation: APPLY_MIGRATION_CONFIRMATION,
    });
    targetSubscriptionId = result.entries[0].targetSubscriptionId ?? "";
    if (!targetSubscriptionId) throw new Error("The migration completed without a canonical subscription reference.");
    revalidatePath("/admin/subscriptions/canonical");
    revalidatePath("/admin/subscriptions/canonical/pilot");
  } catch (error) {
    errorDestination(returnPath, error);
  }
  redirect(`/admin/subscriptions/canonical/${targetSubscriptionId}?pilot=shadow-created`);
}

export async function activateManualPilotLocallyAction(formData: FormData): Promise<void> {
  const subscriptionId = text(formData, "subscriptionId");
  const returnPath = `/admin/subscriptions/canonical/${encodeURIComponent(subscriptionId)}`;
  try {
    const user = await requireLocalStaff();
    const review = await getCanonicalManualPilotReview(subscriptionId);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 30 * 60 * 1000);
    const unsigned: Omit<CanonicalManualPilotAuthorization, "signature"> = {
      authorizationId: randomUUID(),
      operation: "activate_manual_pilot",
      proposalFingerprint: "",
      approvedByEmail: user.email,
      customerId: review.proposal.customerId,
      subscriptionId: review.proposal.subscriptionId,
      migrationKey: review.proposal.migrationKey,
      sourceKind: review.proposal.sourceKind,
      legacyScheduleId: review.proposal.legacyScheduleId,
      sourceInvoiceId: review.proposal.sourceInvoiceId,
      sourceStateFingerprint: review.proposal.sourceStateFingerprint,
      cutoverPeriodStart: review.proposal.cutoverPeriodStart,
      billingIntervalMonths: review.proposal.billingIntervalMonths,
      currency: review.proposal.currency,
      recurringAmount: review.proposal.recurringAmount,
      approvalReason: text(formData, "approvalReason"),
      customerIdentityConfirmed: text(formData, "confirmCustomer") === "yes",
      commercialTermsConfirmed: text(formData, "confirmTerms") === "yes",
      historicalBalancesConfirmed: text(formData, "confirmBalances") === "yes",
      legacyScheduleStopConfirmed: text(formData, "confirmLegacyStop") === "yes",
      canonicalScheduleStartConfirmed: text(formData, "confirmCanonicalStart") === "yes",
      recoveryProcedureConfirmed: text(formData, "confirmRecovery") === "yes",
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    unsigned.proposalFingerprint = canonicalManualPilotProposalFingerprint(review.proposal);
    const authorization: CanonicalManualPilotAuthorization = {
      ...unsigned,
      signature: signCanonicalManualPilotAuthorization(unsigned, process.env),
    };
    await activateCanonicalManualPilot({
      subscriptionId,
      authorization,
      execute: true,
      confirmation: ACTIVATE_MANUAL_PILOT_CONFIRMATION,
    });
    revalidatePath(returnPath);
    revalidatePath("/admin/subscriptions/canonical");
    revalidatePath("/admin/subscriptions/canonical/pilot");
  } catch (error) {
    errorDestination(returnPath, error);
  }
  redirect(`${returnPath}?pilot=activated`);
}
