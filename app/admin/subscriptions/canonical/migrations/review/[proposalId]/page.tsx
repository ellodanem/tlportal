import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { approveIndividualMigrationAction } from "@/app/admin/subscriptions/canonical/migrations/actions";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";
import { getCanonicalMigrationProposalReview } from "@/lib/services/canonical-migration-campaign-service";

type Props = { params: Promise<{ proposalId: string }>; searchParams: Promise<{ error?: string }> };

export default async function IndividualMigrationReviewPage({ params, searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const { proposalId } = await params;
  const { error = "" } = await searchParams;
  const review = await getCanonicalMigrationProposalReview(proposalId);
  if (!review) notFound();
  const { candidate, proposal, assignments, requiredIssues } = review;
  const stripe = proposal.collectionMethod === "stripe_autocharge";
  const sourceCoverageRequired = proposal.sourceKind === "manual_invoice";
  const defaultAnchor = candidate.billingAnchorDate ?? "";
  const defaultNext = candidate.nextBillingDate ?? "";
  const providerCycleDefault = candidate.cycleAmount ?? "";
  const confirmations = [
    ["confirmSource", "I reviewed the source arrangement and every linked service."],
    ["confirmPaidThrough", "I verified the paid-through coverage and next renewal, not a generic month assumption."],
    ["confirmHistory", "I understand all existing invoices, payments, and balances remain unchanged."],
    ["confirmLegacyAuthority", "I understand legacy billing remains authoritative after shadow migration."],
    ["confirmOutstanding", "I reviewed any outstanding balance and am not recording or settling it here."],
    ...(sourceCoverageRequired ? [["confirmCoverage", "I explicitly confirmed the historical invoice coverage dates."]] : []),
    ...(stripe ? [
      ["confirmStripeProvider", "I verified the exact Stripe subscription, items, prices, quantities, and status."],
      ["confirmFutureStripe", "I reviewed future Stripe collection and understand this action does not change it."],
    ] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical/migrations" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Back to migration campaign</Link>
        <p className="mt-4 text-xs font-medium text-zinc-500">Billing / Canonical / Individual migration review</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{candidate.customerLabel}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Confirm exact commercial and financial evidence before approving a protected canonical shadow. Legacy billing remains authoritative.</p>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border p-4"><p className="text-xs text-zinc-500">Source</p><p className="mt-1 font-semibold capitalize">{proposal.sourceKind.replaceAll("_", " ")}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-zinc-500">Collection</p><p className="mt-1 font-semibold">{stripe ? "Stripe autocharge" : "Manual invoice"}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-zinc-500">Legacy cycle</p><p className="mt-1 font-semibold tabular-nums">{candidate.cycleAmount ? formatExpenseAmount(Number(candidate.cycleAmount), candidate.currency) : "Unresolved"}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-zinc-500">Outstanding balance</p><p className="mt-1 font-semibold tabular-nums">{formatExpenseAmount(Number(candidate.outstandingBalance), candidate.currency)}</p></div>
      </section>

      <form action={approveIndividualMigrationAction} className="space-y-6 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <input type="hidden" name="proposalId" value={proposal.proposalId} />
        <input type="hidden" name="sourceCoverageRequired" value={sourceCoverageRequired ? "yes" : "no"} />
        <input type="hidden" name="providerEvidenceRequired" value={stripe ? "yes" : "no"} />

        <div>
          <h2 className="font-semibold">Owner-reviewed commercial terms</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Do not use an invoice issue date or a generic month statement as coverage evidence. Enter the verified paid-through anchor and next renewal from the agreement, schedule, payment record, or provider evidence.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Campaign title<input required name="title" defaultValue={`Migration — ${candidate.customerLabel}`} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal dark:bg-zinc-950" /></label>
          <label className="text-sm font-medium">Owner approval reason<textarea required name="approvalReason" rows={2} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal dark:bg-zinc-950" /></label>
          <label className="text-sm font-medium">Commercial start<input required type="date" name="commercialStartDate" defaultValue={defaultAnchor} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal dark:bg-zinc-950" /></label>
          <label className="text-sm font-medium">Billing anchor / paid-through start<input required type="date" name="billingAnchorDate" defaultValue={defaultAnchor} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal dark:bg-zinc-950" /></label>
          <label className="text-sm font-medium">Next canonical billing date<input required type="date" name="nextBillingDate" defaultValue={defaultNext} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal dark:bg-zinc-950" /></label>
          <label className="text-sm font-medium">Grace period (days)<input required type="number" min="0" name="gracePeriodDays" defaultValue="7" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal dark:bg-zinc-950" /></label>
        </div>

        {sourceCoverageRequired ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold text-amber-950">Historical invoice coverage</h3><p className="mt-1 text-sm text-amber-900">Required for a standalone manual invoice. These dates bind the plan but never edit the historical invoice.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Coverage start<input required type="date" name="sourceCoverageStart" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Coverage end / next renewal<input required type="date" name="sourceCoverageEnd" defaultValue={defaultNext} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label></div></section> : null}

        {stripe ? <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"><h3 className="font-semibold text-blue-950 dark:text-blue-100">Verified Stripe evidence</h3><p className="mt-1 text-sm text-blue-900 dark:text-blue-200">Copy this from the existing provider record after review. This creates a read-only canonical provider link only; it never creates, cancels, pauses, or charges a Stripe subscription.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Existing subscription ID<input required name="providerSubscriptionId" defaultValue={candidate.providerSubscriptionId ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Provider status<input required name="providerStatus" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Provider activation date<input required type="datetime-local" name="providerActivatedAt" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Provider subscription item ID<input required name="providerItemId" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Provider price ID<input required name="providerPriceId" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Provider rate-group fingerprint<input required name="providerRateGroupFingerprint" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Provider group quantity<input required type="number" min="1" name="providerQuantity" defaultValue={assignments.length} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Provider recurring group amount ({candidate.currency})<input required inputMode="decimal" name="providerCycleAmount" defaultValue={providerCycleDefault} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label></div></section> : null}

        <section><h3 className="font-semibold">Service-level agreed rates</h3><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Every active service needs a reviewed per-cycle rate. The exact total is rechecked before approval.</p><div className="mt-3 space-y-3">{assignments.map((assignment, index) => <div key={assignment.serviceAssignmentId} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4"><input type="hidden" name="assignmentId" value={assignment.serviceAssignmentId} /><label className="text-xs font-medium text-zinc-600">Service label<input required name={`label:${assignment.serviceAssignmentId}`} defaultValue={`GPS tracking service ${index + 1}`} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal dark:bg-zinc-950" /></label><label className="text-xs font-medium text-zinc-600">Activated<input required type="date" name={`serviceActivatedDate:${assignment.serviceAssignmentId}`} defaultValue={assignment.serviceActivatedDate ?? defaultAnchor} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal dark:bg-zinc-950" /></label><label className="text-xs font-medium text-zinc-600">Agreed cycle rate ({candidate.currency})<input required inputMode="decimal" name={`amount:${assignment.serviceAssignmentId}`} defaultValue={assignment.proposedCycleAmount ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal dark:bg-zinc-950" /></label><label className="text-xs font-medium text-zinc-600">Classification<select name={`classification:${assignment.serviceAssignmentId}`} defaultValue={assignment.rateClassification === "negotiated" ? "negotiated" : "standard"} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal dark:bg-zinc-950"><option value="standard">Standard</option><option value="negotiated">Negotiated</option></select></label></div>)}</div></section>

        {requiredIssues.length ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold text-amber-950">Required resolutions</h3><p className="mt-1 text-sm text-amber-900">Every existing financial, provider, or mapping exception is part of the fingerprinted plan.</p><div className="mt-3 space-y-3">{requiredIssues.map((issue) => <label key={issue.code} className="block text-sm font-medium"><input type="hidden" name="issueCode" value={issue.code} />{issue.code.replaceAll("_", " ")}<span className="mt-1 block text-xs font-normal text-amber-900">{issue.message}</span><textarea required name={`resolution:${issue.code}`} rows={2} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label>)}</div></section> : null}

        <section className="grid gap-2 text-sm sm:grid-cols-2">{confirmations.map(([name, label]) => <label key={name} className="flex items-start gap-2"><input required type="checkbox" name={name} value="yes" className="mt-1" /><span>{label}</span></label>)}</section>
        <button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Owner approve protected shadow migration</button>
      </form>
    </div>
  );
}
