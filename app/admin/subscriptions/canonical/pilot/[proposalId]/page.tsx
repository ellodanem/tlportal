import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { migrateManualPilotShadowAction } from "@/app/admin/subscriptions/canonical/pilot/actions";
import {
  canonicalIntervalLabel,
  canonicalSubscriptionUiEnabled,
  canonicalSubscriptionUiVisible,
} from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";
import { getCanonicalManualPilotMigrationReview } from "@/lib/services/canonical-manual-pilot-review-service";

type Props = {
  params: Promise<{ proposalId: string }>;
  searchParams: Promise<{ error?: string }>;
};

function money(value: string, currency: string) {
  return formatExpenseAmount(Number(value), currency);
}

export default async function CanonicalManualPilotReviewPage({ params, searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const [{ proposalId }, query] = await Promise.all([params, searchParams]);
  let review: Awaited<ReturnType<typeof getCanonicalManualPilotMigrationReview>>;
  try {
    review = await getCanonicalManualPilotMigrationReview(proposalId);
  } catch {
    notFound();
  }
  const editable = canonicalSubscriptionUiEnabled() && review.candidate.migrationStatus == null;
  const nextBillingDate = review.candidate.nextBillingDate?.slice(0, 10) ?? "";
  const commercialStartDate = review.assignments
    .flatMap((assignment) => assignment.startDate ? [assignment.startDate] : [])
    .sort()[0] ?? nextBillingDate;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical/pilot" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Back to pilot candidates
        </Link>
        <p className="mt-4 text-xs font-medium text-zinc-500">First customer pilot / Migration review</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{review.candidate.customerLabel}</h1>
        <p className="mt-1 text-sm text-zinc-500">Manual schedule {review.candidate.sourceScheduleId}</p>
      </div>

      {query.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{query.error}</p> : null}
      {!editable ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">Read-only review</p><p className="mt-1">Production preview cannot approve or execute migration. A real pilot requires separately signed owner authorization.</p></section> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Current recurring amount</p><p className="mt-2 text-xl font-semibold tabular-nums">{review.candidate.recurringAmount ? money(review.candidate.recurringAmount, review.candidate.currency) : "Unresolved"}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Frequency</p><p className="mt-2 text-xl font-semibold">{canonicalIntervalLabel(review.candidate.billingIntervalMonths)}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Next renewal</p><p className="mt-2 text-xl font-semibold">{nextBillingDate || "Unresolved"}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Outstanding history</p><p className="mt-2 text-xl font-semibold tabular-nums">{money(review.outstandingBalance, review.candidate.currency)}</p></div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Legacy arrangement</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-zinc-500">Collection</dt><dd className="mt-1 font-medium">Manual invoice</dd></div>
          <div><dt className="text-zinc-500">Source status</dt><dd className="mt-1 font-medium capitalize">{review.proposal.lifecycleStatus.replaceAll("_", " ")}</dd></div>
          <div><dt className="text-zinc-500">Review status</dt><dd className="mt-1 font-medium capitalize">{review.candidate.reviewStatus.replaceAll("_", " ")}</dd></div>
          <div><dt className="text-zinc-500">Source fingerprint</dt><dd className="mt-1 truncate font-mono text-xs" title={review.sourceFingerprint}>{review.sourceFingerprint}</dd></div>
        </dl>
        {review.candidate.issueCodes.length ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20"><p className="font-semibold text-amber-900 dark:text-amber-200">Information requiring explicit confirmation</p><ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900 dark:text-amber-200">{review.candidate.issueCodes.map((code) => <li key={code}>{code.replaceAll("_", " ")}</li>)}</ul></div> : null}
      </section>

      <form action={migrateManualPilotShadowAction} className="space-y-6">
        <input type="hidden" name="proposalId" value={review.candidate.proposalId} />
        <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Tracking services and agreed rates</h2>
          <p className="mt-1 text-sm text-zinc-500">Confirm each service individually. Negotiated rates are preserved rather than normalized.</p>
          <div className="mt-4 space-y-3">
            {review.assignments.map((assignment, index) => (
              <div key={assignment.id} className="grid gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2 lg:grid-cols-5 dark:border-zinc-700">
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <div className="lg:col-span-2"><p className="text-sm font-semibold">{assignment.deviceLabel}</p><p className="mt-1 text-xs text-zinc-500">{assignment.simLabel ?? "No SIM linked"} · {assignment.status}</p><p className="mt-1 text-xs text-zinc-500">Service since {assignment.startDate ?? "unknown"} · due {assignment.nextDueDate ?? "unknown"}</p></div>
                <label className="text-sm font-medium">Service label<input disabled={!editable} required name={`label:${assignment.id}`} defaultValue={`Tracking service ${index + 1}`} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
                <label className="text-sm font-medium">Agreed cycle price<input disabled={!editable} required inputMode="decimal" name={`amount:${assignment.id}`} defaultValue={assignment.suggestedAmount ?? ""} placeholder="0.00" className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
                <label className="text-sm font-medium">Rate classification<select disabled={!editable} name={`classification:${assignment.id}`} defaultValue={assignment.suggestedClassification === "standard" ? "standard" : "negotiated"} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800"><option value="standard">Standard</option><option value="negotiated">Negotiated</option></select></label>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Invoices, payments and balances</h2>
          <p className="mt-1 text-sm text-zinc-500">Historical records remain untouched and are included in the approval fingerprint.</p>
          {review.invoices.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-[720px] w-full text-sm"><thead className="text-left text-xs uppercase text-zinc-500"><tr><th className="pb-2">Invoice</th><th className="pb-2">Issued</th><th className="pb-2">Status</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">Paid</th><th className="pb-2 text-right">Due</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{review.invoices.map((invoice) => <tr key={invoice.id}><td className="py-2">{invoice.number ?? invoice.id}</td><td className="py-2">{invoice.issueDate.slice(0, 10)}</td><td className="py-2 capitalize">{invoice.status.replaceAll("_", " ")}</td><td className="py-2 text-right tabular-nums">{money(invoice.total, review.candidate.currency)}</td><td className="py-2 text-right tabular-nums">{money(invoice.amountPaid, review.candidate.currency)}</td><td className="py-2 text-right tabular-nums">{money(invoice.amountDue, review.candidate.currency)}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-zinc-500">No schedule-linked native invoices were found.</p>}
          <p className="mt-4 text-sm font-medium">Recorded payments: {review.payments.length} · Outstanding: <span className="tabular-nums">{money(review.outstandingBalance, review.candidate.currency)}</span></p>
        </section>

        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <h2 className="font-semibold">Canonical migration approval</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">This creates a shadow record only. Legacy billing remains authoritative until a separately signed cutover authorization.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium sm:col-span-2">Subscription name<input disabled={!editable} required name="name" defaultValue={`${review.candidate.customerLabel} tracking services`} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
            <label className="text-sm font-medium sm:col-span-2">Commercial reference<input disabled={!editable} required name="reference" defaultValue={`manual-${review.candidate.sourceScheduleId}`} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
            <label className="text-sm font-medium">Commercial start<input disabled={!editable} required type="date" name="commercialStartDate" defaultValue={commercialStartDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
            <label className="text-sm font-medium">Billing anchor<input disabled={!editable} required type="date" name="billingAnchorDate" defaultValue={nextBillingDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
            <label className="text-sm font-medium">Next billing date<input disabled={!editable} required type="date" name="nextBillingDate" defaultValue={nextBillingDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
            <label className="text-sm font-medium">Grace period<input disabled={!editable} required type="number" min="0" step="1" name="gracePeriodDays" defaultValue="7" className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
            <label className="text-sm font-medium sm:col-span-2 lg:col-span-4">Approval reason and conflict resolution<textarea disabled={!editable} required name="approvalReason" rows={4} placeholder="Confirm the source schedule, rates, renewal date, historical balances, and any resolved review flags." className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-800" /></label>
          </div>
          <div className="mt-5 rounded-lg border border-emerald-200 bg-white p-4 text-sm dark:border-emerald-900 dark:bg-zinc-900"><p className="font-semibold">What changes</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>One fingerprint-bound shadow subscription is created.</li><li>Selected service assignments link to canonical items with their exact approved rates.</li></ul><p className="mt-3 font-semibold">What remains unchanged</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>The legacy recurring schedule remains active.</li><li>Existing invoices, payments, balances, devices and SIM assignments are preserved.</li><li>No invoice, payment, Stripe operation or billing cutover occurs.</li></ul></div>
          {editable ? <button className="mt-5 w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white sm:w-auto">Approve and create shadow subscription</button> : null}
        </section>
      </form>
    </div>
  );
}
