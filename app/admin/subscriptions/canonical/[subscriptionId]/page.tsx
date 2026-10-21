import { notFound, redirect } from "next/navigation";

import { CanonicalSubscriptionDetailWorkspace } from "@/components/admin/canonical-subscription-detail-workspace";
import { prisma } from "@/lib/db";
import { canonicalSubscriptionUiEnabled, canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { previewAnnualSubscriptionAddition } from "@/lib/services/canonical-subscription-application-service";
import { canonicalSubscriptionUiStaffViewer, getCanonicalSubscriptionAdminDetail } from "@/lib/services/canonical-subscription-admin-service";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ periodStart?: string; periodEnd?: string; activationDate?: string; annualAmount?: string; error?: string; pilot?: string }>;
};

function iso(value: Date | null | undefined) { return value?.toISOString().slice(0, 10) ?? ""; }

export default async function CanonicalSubscriptionDetailPage({ params, searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const [{ subscriptionId }, previewQuery] = await Promise.all([params, searchParams]);
  const subscription = await getCanonicalSubscriptionAdminDetail(subscriptionId);
  if (!subscription) notFound();

  const editable = subscription.access === "editable_draft" && (canonicalSubscriptionUiEnabled() || (subscription.controlMode === "canonical" && canonicalSubscriptionUiVisible()));
  const canManage = subscription.controlMode === "canonical" && ["editable_draft", "canonical_operational"].includes(subscription.access) && (canonicalSubscriptionUiEnabled() || canonicalSubscriptionUiVisible());
  const [transferTargets, replacementAssignments] = canManage ? await Promise.all([
    prisma.customerSubscription.findMany({
      where: { customerId: subscription.customerId, id: { not: subscription.id }, controlMode: "canonical", lifecycleStatus: { in: ["draft", "pending_activation", "active", "paused"] }, canonicalMigrationLedger: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, reference: true },
    }),
    prisma.serviceAssignment.findMany({
      where: { customerId: subscription.customerId, subscriptionItemId: null, endDate: null, status: { not: "cancelled" } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }], select: { id: true, device: { select: { label: true, deviceModel: { select: { name: true } } } } },
    }),
  ]) : [[], []] as const;

  const localPilotActivationAvailable = canonicalSubscriptionUiEnabled()
    && process.env.CANONICAL_MANUAL_PILOT_ENABLED === "true"
    && process.env.CANONICAL_MANUAL_PILOT_CUSTOMER_ID === subscription.customerId
    && process.env.CANONICAL_MANUAL_PILOT_SUBSCRIPTION_ID === subscription.id
    && Boolean(process.env.CANONICAL_MANUAL_PILOT_APPROVAL_SECRET)
    && subscription.controlMode === "shadow"
    && subscription.manualPilotReview != null
    && subscription.manualPilotReview.blockers.length === 0;

  let annualPreview: Awaited<ReturnType<typeof previewAnnualSubscriptionAddition>> | null = null;
  let annualPreviewError: string | null = null;
  if (subscription.billingIntervalMonths === 12 && previewQuery.periodStart && previewQuery.periodEnd && previewQuery.activationDate) {
    try {
      annualPreview = await previewAnnualSubscriptionAddition({ subscriptionId, annualPeriodStart: previewQuery.periodStart, annualPeriodEnd: previewQuery.periodEnd, serviceActivatedDate: previewQuery.activationDate, agreedAnnualAmount: previewQuery.annualAmount || null });
    } catch (error) {
      annualPreviewError = error instanceof Error ? error.message : "The annual preview could not be calculated.";
    }
  }

  return <CanonicalSubscriptionDetailWorkspace subscription={subscription} editable={editable} canManage={canManage} nextBillingDate={iso(subscription.nextBillingDate)} previewQuery={previewQuery} annualPreview={annualPreview} annualPreviewError={annualPreviewError} localPilotActivationAvailable={localPilotActivationAvailable} transferTargets={transferTargets} replacementAssignments={replacementAssignments} />;
}
