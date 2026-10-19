import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { executeSimpleIndividualMigrationAction } from "@/app/admin/subscriptions/canonical/migrations/actions";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";
import { getCanonicalMigrationProposalReview } from "@/lib/services/canonical-migration-campaign-service";

type Props = { params: Promise<{ proposalId: string }>; searchParams: Promise<{ error?: string }> };

function date(value: string | null | undefined) {
  return value?.slice(0, 10) ?? "Unresolved";
}

function collectionLabel(value: string | null) {
  return value === "stripe_autocharge" ? "Stripe autocharge" : "Manual invoice";
}

export default async function IndividualMigrationReviewPage({ params, searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const [{ proposalId }, { error = "" }] = await Promise.all([params, searchParams]);
  const review = await getCanonicalMigrationProposalReview(proposalId);
  if (!review) notFound();
  const { candidate, proposal, assignments, requiredIssues, financialHistory, stripeEvidence } = review;
  const stripe = proposal.collectionMethod === "stripe_autocharge";
  const migrated = candidate.operationalStatus === "migrated";
  const sourceCoverageRequired = proposal.sourceKind === "manual_invoice";
  const defaultAnchor = candidate.billingAnchorDate ?? "";
  const defaultNext = candidate.nextBillingDate ?? "";
  const commercialStart = assignments.flatMap((assignment) => assignment.serviceActivatedDate ? [assignment.serviceActivatedDate] : []).sort()[0] ?? defaultAnchor;
  const valuesComplete = Boolean(defaultAnchor && defaultNext && assignments.length)
    && assignments.every((assignment) => assignment.proposedCycleAmount != null && assignment.serviceActivatedDate != null);
  const canExecute = !stripe && !migrated && valuesComplete;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical/migrations" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Back to customer migration</Link>
        <p className="mt-4 text-xs font-medium text-zinc-500">Billing / Canonical / Confirm migration</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Migrate {candidate.customerLabel}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">TL Portal prepared this arrangement from the customer’s existing billing and service records.</p>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">{error}</p> : null}
      {migrated ? <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><p className="font-semibold">Migration complete</p><p className="mt-1 text-sm">Canonical billing owns the next renewal and the competing legacy authority has been retired.</p>{candidate.targetSubscriptionId ? <Link href={`/admin/subscriptions/canonical/${candidate.targetSubscriptionId}`} className="mt-3 inline-block text-sm font-semibold underline">Open canonical subscription</Link> : null}</section> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Tracking services</p><p className="mt-2 text-xl font-semibold tabular-nums">{candidate.serviceCount}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Recurring amount</p><p className="mt-2 text-xl font-semibold tabular-nums">{candidate.cycleAmount ? formatExpenseAmount(Number(candidate.cycleAmount), candidate.currency) : "Unresolved"}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Frequency</p><p className="mt-2 text-xl font-semibold">Every {candidate.billingIntervalMonths} month{candidate.billingIntervalMonths === 1 ? "" : "s"}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Next billing</p><p className="mt-2 text-xl font-semibold">{date(candidate.nextBillingDate)}</p></div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Current and proposed billing</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-zinc-500">Payment method</dt><dd className="mt-1 font-medium">{collectionLabel(candidate.collectionMethod)}</dd></div>
          <div><dt className="text-zinc-500">Current recurring amount</dt><dd className="mt-1 font-medium tabular-nums">{candidate.cycleAmount ? formatExpenseAmount(Number(candidate.cycleAmount), candidate.currency) : "Unresolved"}</dd></div>
          <div><dt className="text-zinc-500">Proposed recurring amount</dt><dd className="mt-1 font-medium tabular-nums">{candidate.cycleAmount ? formatExpenseAmount(Number(candidate.cycleAmount), candidate.currency) : "Unresolved"}</dd></div>
          <div><dt className="text-zinc-500">Subscription balance</dt><dd className="mt-1 font-medium tabular-nums">{formatExpenseAmount(Number(candidate.outstandingBalance), candidate.currency)}</dd></div>
          <div><dt className="text-zinc-500">Paid through</dt><dd className="mt-1 font-medium">{date(candidate.paidThroughDate)}</dd></div>
          <div><dt className="text-zinc-500">Native invoices</dt><dd className="mt-1 font-medium">{financialHistory.nativeInvoiceCount}</dd></div>
          <div><dt className="text-zinc-500">Recorded payments</dt><dd className="mt-1 font-medium">{financialHistory.paymentCount}</dd></div>
          <div><dt className="text-zinc-500">Provider invoices</dt><dd className="mt-1 font-medium">{financialHistory.providerInvoiceCount}</dd></div>
        </dl>
        {candidate.nonSubscriptionOutstandingBalance !== "0.00" ? <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">Separate hardware, installation, or other one-off AR: <strong>{formatExpenseAmount(Number(candidate.nonSubscriptionOutstandingBalance), candidate.currency)}</strong>. It remains collectible and does not affect this subscription.</p> : null}
      </section>

      {stripe ? <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-6 dark:border-blue-900 dark:bg-blue-950/30"><h2 className="font-semibold text-blue-950 dark:text-blue-100">Stripe reconciliation</h2>{stripeEvidence?.available ? <><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-blue-800 dark:text-blue-300">Provider status</dt><dd className="mt-1 font-medium capitalize">{stripeEvidence.status ?? "Unknown"}</dd></div><div><dt className="text-blue-800 dark:text-blue-300">Stripe recurring total</dt><dd className="mt-1 font-medium tabular-nums">{stripeEvidence.recurringTotal == null ? "Unresolved" : formatExpenseAmount(Number(stripeEvidence.recurringTotal), stripeEvidence.currency ?? candidate.currency)}</dd></div><div><dt className="text-blue-800 dark:text-blue-300">Current period ends</dt><dd className="mt-1 font-medium">{date(stripeEvidence.currentPeriodEnd)}</dd></div><div><dt className="text-blue-800 dark:text-blue-300">Latest invoice</dt><dd className="mt-1 font-medium capitalize">{stripeEvidence.latestInvoiceStatus ?? "Unknown"}</dd></div></dl>{stripeEvidence.cancelAtPeriodEnd ? <p className="mt-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">Stripe is scheduled to cancel at period end.</p> : null}</> : <p className="mt-3 text-sm text-blue-900 dark:text-blue-200">{stripeEvidence?.reason ?? "Stripe evidence is unavailable."}</p>}<p className="mt-4 rounded-lg border border-blue-300 bg-white p-3 text-sm text-blue-950 dark:border-blue-800 dark:bg-zinc-900 dark:text-blue-100"><strong>Needs attention:</strong> TL Portal can inspect this existing subscription, but production provider adoption is not yet safely supported. Legacy Stripe billing remains authoritative and no provider change will be made.</p></section> : null}

      {!stripe && !migrated ? <form action={executeSimpleIndividualMigrationAction} className="space-y-5 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-6 dark:border-emerald-900 dark:bg-emerald-950/20">
        <input type="hidden" name="proposalId" value={proposal.proposalId} />
        <input type="hidden" name="reviewFingerprint" value={review.reviewFingerprint} />
        <input type="hidden" name="sourceCoverageRequired" value={sourceCoverageRequired ? "yes" : "no"} />
        <div><h2 className="font-semibold">Confirm and migrate</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">This will create the canonical agreement, move future manual invoicing to it, and end the matching legacy schedule in one protected workflow. It will not issue today’s invoice.</p></div>

        {!valuesComplete ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">Migration is blocked because the current records do not establish complete dates, services, and pricing.</p> : null}
        {requiredIssues.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Review these specific exceptions</p><ul className="mt-2 list-disc space-y-1 pl-5">{requiredIssues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul></div> : null}

        <details className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900" open={sourceCoverageRequired}>
          <summary className="cursor-pointer font-semibold">Commercial values</summary>
          <p className="mt-1 text-sm text-zinc-500">These are prefilled from current records. Change them only if the displayed agreement is wrong.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium">Commercial start<input required type="date" name="commercialStartDate" defaultValue={commercialStart} className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal dark:bg-zinc-950" /></label>
            <label className="text-sm font-medium">Billing anchor<input required type="date" name="billingAnchorDate" defaultValue={defaultAnchor} className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal dark:bg-zinc-950" /></label>
            <label className="text-sm font-medium">Next billing<input required type="date" name="nextBillingDate" defaultValue={defaultNext} className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal dark:bg-zinc-950" /></label>
            <label className="text-sm font-medium">Grace period<input required type="number" min="0" max="365" name="gracePeriodDays" defaultValue="7" className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal dark:bg-zinc-950" /></label>
          </div>
          {sourceCoverageRequired ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Confirmed invoice coverage start<input required type="date" name="sourceCoverageStart" defaultValue={defaultAnchor} className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal dark:bg-zinc-950" /></label><label className="text-sm font-medium">Confirmed coverage end<input required type="date" name="sourceCoverageEnd" defaultValue={defaultNext} className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal dark:bg-zinc-950" /></label></div> : null}
          <div className="mt-4 space-y-3">{assignments.map((assignment, index) => <div key={assignment.serviceAssignmentId} className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800"><input type="hidden" name="assignmentId" value={assignment.serviceAssignmentId} /><label className="text-sm font-medium">Service<input required name={`label:${assignment.serviceAssignmentId}`} defaultValue={`GPS tracking service ${index + 1}`} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal dark:bg-zinc-950" /></label><label className="text-sm font-medium">Activated<input required type="date" name={`serviceActivatedDate:${assignment.serviceAssignmentId}`} defaultValue={assignment.serviceActivatedDate ?? commercialStart} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal dark:bg-zinc-950" /></label><label className="text-sm font-medium">Rate per cycle<input required inputMode="decimal" name={`amount:${assignment.serviceAssignmentId}`} defaultValue={assignment.proposedCycleAmount ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal dark:bg-zinc-950" /></label><label className="text-sm font-medium">Rate type<select name={`classification:${assignment.serviceAssignmentId}`} defaultValue={assignment.rateClassification === "negotiated" ? "negotiated" : "standard"} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal dark:bg-zinc-950"><option value="standard">Standard</option><option value="negotiated">Negotiated</option></select></label></div>)}</div>
        </details>

        <label className="block text-sm font-medium">Owner review note<textarea required name="approvalReason" rows={3} placeholder="Confirmed current services, recurring price, paid-through period, and next renewal." className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-normal dark:border-zinc-700 dark:bg-zinc-900" /></label>
        <div className="grid gap-2 text-sm sm:grid-cols-2">{[["confirmCustomerAndServices", "The customer and active tracking services are correct."], ["confirmCommercialTerms", "The price, frequency, paid-through period, and next billing date are correct."], ["confirmHistory", "Existing invoices, payments, and balances must remain unchanged."], ["confirmAuthorityTransfer", "After success, canonical billing becomes the only authority for the next renewal."]].map(([name, label]) => <label key={name} className="flex items-start gap-2"><input required type="checkbox" name={name} value="yes" className="mt-1 h-4 w-4" /><span>{label}</span></label>)}</div>
        <button disabled={!canExecute} className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400 sm:w-auto">Confirm and migrate</button>
      </form> : null}

      <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer font-semibold">Technical reconciliation details</summary>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2"><div><dt className="text-zinc-500">Source type</dt><dd className="font-mono text-xs">{proposal.sourceKind}</dd></div><div><dt className="text-zinc-500">Source reference</dt><dd className="break-all font-mono text-xs">{proposal.sourceId}</dd></div><div><dt className="text-zinc-500">Proposal reference</dt><dd className="break-all font-mono text-xs">{proposal.proposalId}</dd></div><div><dt className="text-zinc-500">Canonical target</dt><dd className="break-all font-mono text-xs">{candidate.targetSubscriptionId ?? "Not created"}</dd></div>{stripeEvidence?.subscriptionId ? <div><dt className="text-zinc-500">Stripe subscription</dt><dd className="break-all font-mono text-xs">{stripeEvidence.subscriptionId}</dd></div> : null}</dl>
      </details>
    </div>
  );
}
