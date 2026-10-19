"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/get-session";
import { isSuperAdminEmail } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import {
  classifyStandaloneInvoiceForMigration,
  createOwnerApprovedIndividualMigrationCampaign,
  createOwnerApprovedMigrationCampaign,
  executeOwnerApprovedMigrationCampaign,
} from "@/lib/services/canonical-migration-campaign-service";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

async function requireMigrationOwner() {
  if (!canonicalSubscriptionUiVisible()) throw new Error("Canonical migration review is unavailable.");
  const session = await getSession();
  if (!session) throw new Error("You must be signed in.");
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true },
  });
  if (!user || !isSuperAdminEmail(user.email) || user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
    throw new Error("Only the configured billing owner can approve or execute a migration campaign.");
  }
  return user;
}

function destinationError(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "The migration campaign could not be completed.";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function approveMigrationCampaignAction(formData: FormData): Promise<void> {
  const returnPath = "/admin/subscriptions/canonical/migrations";
  try {
    const owner = await requireMigrationOwner();
    const campaign = await createOwnerApprovedMigrationCampaign({
      proposalIds: formData.getAll("proposalId").map(String),
      title: text(formData, "title"),
      approvalReason: text(formData, "approvalReason"),
      ownerUserId: owner.id,
      ownerEmail: owner.email,
      confirmations: {
        sourceAndServicesReviewed: text(formData, "confirmSource") === "yes",
        paidThroughAndRenewalReviewed: text(formData, "confirmPaidThrough") === "yes",
        financialHistoryPreserved: text(formData, "confirmHistory") === "yes",
        legacyAuthorityRetained: text(formData, "confirmLegacyAuthority") === "yes",
      },
    });
    revalidatePath(returnPath);
    redirect(`/admin/subscriptions/canonical/migrations/${campaign.id}?approved=1`);
  } catch (error) {
    destinationError(returnPath, error);
  }
}

export async function executeMigrationCampaignAction(formData: FormData): Promise<void> {
  const campaignId = text(formData, "campaignId");
  const returnPath = `/admin/subscriptions/canonical/migrations/${encodeURIComponent(campaignId)}`;
  try {
    const owner = await requireMigrationOwner();
    const result = await executeOwnerApprovedMigrationCampaign({
      campaignId,
      ownerUserId: owner.id,
      ownerEmail: owner.email,
    });
    revalidatePath("/admin/subscriptions/canonical");
    revalidatePath("/admin/subscriptions/canonical/migrations");
    revalidatePath(returnPath);
    redirect(`${returnPath}?migrated=${result.migrated}&blocked=${result.blocked}&failed=${result.failed}`);
  } catch (error) {
    destinationError(returnPath, error);
  }
}

export async function approveIndividualMigrationAction(formData: FormData): Promise<void> {
  const proposalId = text(formData, "proposalId");
  const returnPath = `/admin/subscriptions/canonical/migrations/review/${encodeURIComponent(proposalId)}`;
  try {
    const owner = await requireMigrationOwner();
    const assignmentIds = formData.getAll("assignmentId").map(String);
    const issueCodes = formData.getAll("issueCode").map(String);
    const campaign = await createOwnerApprovedIndividualMigrationCampaign({
      proposalId,
      title: text(formData, "title"),
      approvalReason: text(formData, "approvalReason"),
      ownerUserId: owner.id,
      ownerEmail: owner.email,
      commercialStartDate: text(formData, "commercialStartDate"),
      billingAnchorDate: text(formData, "billingAnchorDate"),
      nextBillingDate: text(formData, "nextBillingDate"),
      gracePeriodDays: Number(text(formData, "gracePeriodDays")),
      items: assignmentIds.map((assignmentId) => ({
        assignmentId,
        label: text(formData, `label:${assignmentId}`),
        serviceActivatedDate: text(formData, `serviceActivatedDate:${assignmentId}`),
        agreedAmountPerCycle: text(formData, `amount:${assignmentId}`),
        classification: text(formData, `classification:${assignmentId}`) === "negotiated" ? "negotiated" : "standard",
      })),
      issueResolutions: issueCodes.map((code) => ({ code, explanation: text(formData, `resolution:${code}`) })),
      sourceInvoiceCoverage: text(formData, "sourceCoverageRequired") === "yes" ? {
        periodStart: text(formData, "sourceCoverageStart"),
        periodEnd: text(formData, "sourceCoverageEnd"),
        explicitlyConfirmed: true,
      } : null,
      providerEvidence: text(formData, "providerEvidenceRequired") === "yes" ? {
        externalSubscriptionId: text(formData, "providerSubscriptionId"),
        providerStatus: text(formData, "providerStatus") || null,
        activatedAt: text(formData, "providerActivatedAt"),
        items: [{
          externalSubscriptionItemId: text(formData, "providerItemId"),
          externalPriceId: text(formData, "providerPriceId"),
          agreedAmountPerCycle: text(formData, "providerCycleAmount"),
          quantity: Number(text(formData, "providerQuantity")),
          rateGroupFingerprint: text(formData, "providerRateGroupFingerprint"),
        }],
      } : null,
      confirmations: {
        sourceAndServicesReviewed: text(formData, "confirmSource") === "yes",
        paidThroughAndRenewalReviewed: text(formData, "confirmPaidThrough") === "yes",
        financialHistoryPreserved: text(formData, "confirmHistory") === "yes",
        legacyAuthorityRetained: text(formData, "confirmLegacyAuthority") === "yes",
        outstandingBalanceReviewed: text(formData, "confirmOutstanding") === "yes",
        sourceCoverageReviewed: text(formData, "confirmCoverage") === "yes",
        stripeProviderReviewed: text(formData, "confirmStripeProvider") === "yes",
        futureStripeCollectionReviewed: text(formData, "confirmFutureStripe") === "yes",
      },
    });
    revalidatePath("/admin/subscriptions/canonical/migrations");
    redirect(`/admin/subscriptions/canonical/migrations/${campaign.id}?approved=1`);
  } catch (error) {
    destinationError(returnPath, error);
  }
}

export async function classifyStandaloneInvoiceAction(formData: FormData): Promise<void> {
  const returnPath = "/admin/subscriptions/canonical/migrations/invoices";
  try {
    const owner = await requireMigrationOwner();
    if (text(formData, "confirmNoBillingEffect") !== "yes") {
      throw new Error("Confirm that classification does not create, change, or settle any invoice, payment, Stripe transaction, or billing authority.");
    }
    const classification = text(formData, "classification");
    if (classification !== "non_subscription" && classification !== "recurring_evidence") {
      throw new Error("Choose a valid invoice classification.");
    }
    await classifyStandaloneInvoiceForMigration({
      invoiceId: text(formData, "invoiceId"),
      classification,
      reason: text(formData, "reason"),
      ownerUserId: owner.id,
    });
    revalidatePath("/admin/subscriptions/canonical/migrations");
    revalidatePath(returnPath);
    redirect(`${returnPath}?classified=1`);
  } catch (error) {
    destinationError(returnPath, error);
  }
}
