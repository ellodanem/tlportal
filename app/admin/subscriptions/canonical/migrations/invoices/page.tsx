import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { classifyStandaloneInvoiceAction } from "@/app/admin/subscriptions/canonical/migrations/actions";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";
import { listStandaloneInvoiceMigrationReviews } from "@/lib/services/canonical-migration-campaign-service";

type Props = { searchParams: Promise<{ classified?: string; error?: string }> };

function classificationLabel(value: string) {
  if (value === "non_subscription") return "Not subscription-related";
  if (value === "recurring_evidence") return "Recurring evidence";
  return "Needs classification";
}

export default async function StandaloneInvoiceMigrationReviewPage({ searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const { classified, error = "" } = await searchParams;
  const invoices = await listStandaloneInvoiceMigrationReviews();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical/migrations" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Back to migration campaign</Link>
        <p className="mt-4 text-xs font-medium text-zinc-500">Billing / Standalone invoice classification</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Classify one-off invoices</h1>
        <p className="mt-1 max-w-4xl text-sm text-zinc-600 dark:text-zinc-400">Hardware, installation, deposit, and other one-time invoices remain financial history only. They do not create subscriptions, change payments, or affect a renewal unless the billing owner explicitly classifies the exact invoice as recurring subscription evidence.</p>
      </div>

      {classified ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">Invoice classification recorded. Recurring evidence is considered only when the customer has no active subscription or recurring schedule; it then requires a separate, fingerprinted subscription review.</p> : null}
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">{error}</p> : null}

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-semibold">Use recurring evidence only when it truly documents a repeating service agreement.</p>
        <p className="mt-1">A card payment, invoice description, or generic payment month is not enough. The subsequent subscription review still requires the confirmed coverage dates, services, cadence, and per-service recurring price.</p>
      </section>

      <div className="space-y-4">
        {invoices.length === 0 ? <section className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">There are no standalone invoices awaiting classification.</section> : invoices.map((invoice) => (
          <form key={invoice.invoiceId} action={classifyStandaloneInvoiceAction} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <input type="hidden" name="invoiceId" value={invoice.invoiceId} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold">{invoice.customerLabel}</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{invoice.invoiceNumber ?? "Unnumbered invoice"} · issued {invoice.issueDate.toLocaleDateString()} · {formatExpenseAmount(Number(invoice.total), invoice.currency)}</p>
              </div>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${invoice.classification === "recurring_evidence" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : invoice.classification === "non_subscription" ? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{classificationLabel(invoice.classification)}</span>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Open balance: {formatExpenseAmount(Number(invoice.amountDue), invoice.currency)}. Classification does not settle, hide, or alter this balance.</p>
            <label className="mt-4 block text-sm font-medium">Owner classification reason<textarea required name="reason" minLength={12} rows={2} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-950" placeholder="For example: GPS installation and hardware charge only; not recurring service." /></label>
            <label className="mt-3 flex items-start gap-2 text-sm"><input required type="checkbox" name="confirmNoBillingEffect" value="yes" className="mt-1" /><span>I confirm this only classifies migration evidence. It does not change the invoice, payment, Stripe activity, legacy billing, or subscription billing authority.</span></label>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button name="classification" value="non_subscription" className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700">Mark not subscription-related</button>
              <button name="classification" value="recurring_evidence" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Use as recurring evidence</button>
            </div>
            {invoice.recentClassifications.length ? <p className="mt-4 text-xs text-zinc-500">Latest: {classificationLabel(invoice.recentClassifications[0]!.classification)} by {invoice.recentClassifications[0]!.classifiedBy} on {invoice.recentClassifications[0]!.createdAt.toLocaleString()}.</p> : null}
          </form>
        ))}
      </div>
    </div>
  );
}
