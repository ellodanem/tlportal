import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AddCanonicalDraftItemForm,
  EditCanonicalDraftItemForm,
  ScheduleCanonicalDraftItemEndForm,
  ScheduleCanonicalDraftRateForm,
} from "@/components/admin/canonical-subscription-draft-forms";
import {
  canonicalControlLabel,
  canonicalIntervalLabel,
  canonicalSubscriptionUiEnabled,
} from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { previewAnnualSubscriptionAddition } from "@/lib/services/canonical-subscription-application-service";
import { getCanonicalSubscriptionAdminDetail } from "@/lib/services/canonical-subscription-admin-service";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ periodStart?: string; periodEnd?: string; activationDate?: string; annualAmount?: string }>;
};

function iso(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? "";
}

function displayDate(value: Date | null | undefined) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) ?? "—";
}

function money(value: string | number | null | undefined, currency = "XCD") {
  return value == null ? "—" : formatExpenseAmount(Number(value), currency);
}

function collectionLabel(value: string | null) {
  return value === "stripe_autocharge" ? "Stripe autocharge preference" : value === "manual_invoice" ? "Manual invoice" : "Legacy collection";
}

export default async function CanonicalSubscriptionDetailPage({ params, searchParams }: Props) {
  if (!canonicalSubscriptionUiEnabled()) notFound();
  const [{ subscriptionId }, previewQuery] = await Promise.all([params, searchParams]);
  const subscription = await getCanonicalSubscriptionAdminDetail(subscriptionId);
  if (!subscription) notFound();
  const editable = subscription.access === "editable_draft";
  const currency = subscription.currency ?? "XCD";
  const nextBillingDate = iso(subscription.nextBillingDate);
  let annualPreview: Awaited<ReturnType<typeof previewAnnualSubscriptionAddition>> | null = null;
  let annualPreviewError: string | null = null;
  if (
    subscription.billingIntervalMonths === 12
    && previewQuery.periodStart
    && previewQuery.periodEnd
    && previewQuery.activationDate
  ) {
    try {
      annualPreview = await previewAnnualSubscriptionAddition({
        subscriptionId,
        annualPeriodStart: previewQuery.periodStart,
        annualPeriodEnd: previewQuery.periodEnd,
        serviceActivatedDate: previewQuery.activationDate,
        agreedAnnualAmount: previewQuery.annualAmount || null,
      });
    } catch (error) {
      annualPreviewError = error instanceof Error ? error.message : "The annual preview could not be calculated.";
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Link href="/admin/subscriptions/canonical" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Canonical subscriptions</Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-medium text-zinc-500">{subscription.customerLabel}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{subscription.name ?? "Subscription"}</h1><p className="mt-1 text-sm text-zinc-500">{subscription.reference || "No commercial reference"}</p></div>
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{canonicalControlLabel(subscription.access)}</span><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold capitalize text-blue-800 dark:bg-blue-950 dark:text-blue-200">{(subscription.lifecycleStatus ?? subscription.status).replaceAll("_", " ")}</span></div>
        </div>
      </div>

      {subscription.controlMode === "legacy" ? <section className="rounded-xl border border-zinc-300 bg-zinc-100 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900"><p className="font-semibold">Legacy billing remains authoritative</p><p className="mt-1 text-zinc-600 dark:text-zinc-400">This record is intentionally read-only here. Continue managing it in the established customer subscription workflow.</p><Link href={`/admin/subscriptions/${subscription.customerId}`} className="mt-3 inline-block font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open legacy workflow</Link></section> : subscription.access === "migrated_shadow_read_only" ? <section className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100"><p className="font-semibold">Migrated shadow record — read only</p><p className="mt-1">Migration evidence is preserved. Phase UI-1 does not authorize edits or cutover.</p></section> : subscription.controlMode === "canonical" ? <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><p className="font-semibold">Canonical arrangement — read only in this phase</p><p className="mt-1">This screen exposes no billing execution, lifecycle, invoice, payment, or provider controls.</p></section> : !editable ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">Shadow record — read only</p><p className="mt-1">Only unmigrated shadow records in draft lifecycle are editable.</p></section> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Overview</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-zinc-500">Customer</dt><dd className="mt-1 font-medium">{subscription.customerLabel}</dd></div><div><dt className="text-zinc-500">Collection</dt><dd className="mt-1 font-medium">{collectionLabel(subscription.collectionMethod)}</dd></div><div><dt className="text-zinc-500">Frequency</dt><dd className="mt-1 font-medium">{canonicalIntervalLabel(subscription.billingIntervalMonths)}</dd></div><div><dt className="text-zinc-500">Default service price</dt><dd className="mt-1 font-medium tabular-nums">{money(subscription.agreedAmountPerCycle?.toString(), currency)}</dd></div><div><dt className="text-zinc-500">Commercial start</dt><dd className="mt-1 font-medium">{displayDate(subscription.commercialStartDate)}</dd></div><div><dt className="text-zinc-500">Billing anchor</dt><dd className="mt-1 font-medium">{displayDate(subscription.billingAnchorDate)}</dd></div><div><dt className="text-zinc-500">Next billing</dt><dd className="mt-1 font-medium">{displayDate(subscription.nextBillingDate)}</dd></div><div><dt className="text-zinc-500">Grace period</dt><dd className="mt-1 font-medium">{subscription.gracePeriodDays} days</dd></div></dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-semibold">Billing summary</h2><p className="mt-1 text-sm text-zinc-500">Resolved by the same Phase 3A service used for canonical native billing.</p></div><span className="text-xs font-medium text-zinc-500">Preview only · no invoice generated</span></div>
        {subscription.summary ? <><dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Recurring cycle total</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.summary.recurringCycleTotal, currency)}</dd></div><div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Normalized MRR</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.normalizedMrr, currency)}</dd></div><div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Outstanding balance</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.summary.outstandingBalance, currency)}</dd></div><div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Collection health</dt><dd className="mt-1 text-lg font-semibold capitalize">{subscription.summary.collectionHealth.replaceAll("_", " ")}</dd></div></dl>{subscription.summary.validationIssues.length > 0 ? <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20"><summary className="cursor-pointer font-semibold text-amber-900 dark:text-amber-200">Execution remains unavailable ({subscription.summary.validationIssues.length} safeguard{subscription.summary.validationIssues.length === 1 ? "" : "s"})</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900 dark:text-amber-200">{subscription.summary.validationIssues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul></details> : null}</> : <p className="mt-4 text-sm text-zinc-500">Canonical financial preview is unavailable for this legacy record.</p>}
      </section>

      <section className="space-y-4">
        <div><h2 className="text-lg font-semibold">Billable services</h2><p className="mt-1 text-sm text-zinc-500">Commercial services and their effective-dated rates. Device history is read-only.</p></div>
        {subscription.items.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">No billable services have been added.</div> : subscription.items.map((item) => {
          const latestRate = item.rates.at(-1);
          return <article key={item.id} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{item.label || "Tracking service"}</h3><p className="mt-1 text-xs capitalize text-zinc-500">{item.status.replaceAll("_", " ")} · {item.rates.length} price record{item.rates.length === 1 ? "" : "s"}</p></div>{latestRate ? <div className="text-left sm:text-right"><p className="text-lg font-semibold tabular-nums">{money(latestRate.agreedAmountPerCycle.toString(), latestRate.currency)}</p><p className="text-xs capitalize text-zinc-500">{latestRate.classification} / cycle</p></div> : null}</div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-zinc-500">Activated</dt><dd className="mt-1 font-medium">{displayDate(item.serviceActivatedDate)}</dd></div><div><dt className="text-zinc-500">Billing effective</dt><dd className="mt-1 font-medium">{displayDate(item.billingEffectiveFrom)}</dd></div><div><dt className="text-zinc-500">Billing ends</dt><dd className="mt-1 font-medium">{displayDate(item.billingEffectiveUntil)}</dd></div></dl>
            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800"><h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Price history</h4>{item.rates.length ? <div className="mt-2 space-y-2">{item.rates.map((rate) => <div key={rate.id} className="flex flex-col justify-between gap-1 rounded-lg bg-zinc-50 px-3 py-2 text-sm sm:flex-row dark:bg-zinc-950"><span className="font-medium tabular-nums">{money(rate.agreedAmountPerCycle.toString(), rate.currency)} · <span className="capitalize">{rate.classification}</span></span><span className="text-zinc-500">{displayDate(rate.effectiveFrom)} → {displayDate(rate.effectiveUntil)}</span></div>)}</div> : <p className="mt-2 text-sm text-zinc-500">No price history.</p>}</div>
            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800"><h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hardware assignment history</h4>{item.serviceAssignments.length ? <div className="mt-2 space-y-2">{item.serviceAssignments.map((assignment) => <div key={assignment.id} className="flex flex-col justify-between gap-1 text-sm sm:flex-row"><span>{assignment.device.label?.trim() || assignment.device.deviceModel.name} <span className="capitalize text-zinc-500">· {assignment.status.replaceAll("_", " ")}</span></span><span className="text-zinc-500">{displayDate(assignment.startDate)} → {displayDate(assignment.endDate)}</span></div>)}</div> : <p className="mt-2 text-sm text-zinc-500">No linked device history. Assignment and replacement controls are unavailable in Phase UI-1.</p>}</div>
            {editable ? <details className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"><summary className="cursor-pointer text-sm font-semibold">Manage draft service</summary><div className="mt-4 grid gap-5 lg:grid-cols-3"><div className="lg:col-span-3"><EditCanonicalDraftItemForm item={{ id: item.id, subscriptionId, label: item.label ?? "", notes: item.notes ?? "", serviceActivatedDate: iso(item.serviceActivatedDate), billingEffectiveFrom: iso(item.billingEffectiveFrom) }} /></div><ScheduleCanonicalDraftRateForm itemId={item.id} subscriptionId={subscriptionId} nextBillingDate={nextBillingDate} currentAmount={latestRate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00"} /><ScheduleCanonicalDraftItemEndForm itemId={item.id} subscriptionId={subscriptionId} /></div></details> : null}
          </article>;
        })}
        {editable ? <AddCanonicalDraftItemForm subscriptionId={subscriptionId} nextBillingDate={nextBillingDate} defaultAmount={subscription.agreedAmountPerCycle?.toString() ?? "0.00"} /> : null}
      </section>

      {subscription.billingIntervalMonths === 12 && subscription.controlMode !== "legacy" ? <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Annual mid-cycle addition preview</h2><p className="mt-1 text-sm text-zinc-500">Uses the existing annual proration service. This is not an adjustment invoice or payment obligation.</p><form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium">Period start<input required type="date" name="periodStart" defaultValue={previewQuery.periodStart ?? iso(subscription.billingAnchorDate)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Period end<input required type="date" name="periodEnd" defaultValue={previewQuery.periodEnd ?? nextBillingDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Activation date<input required type="date" name="activationDate" defaultValue={previewQuery.activationDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Annual amount (EC$)<input name="annualAmount" inputMode="decimal" defaultValue={previewQuery.annualAmount ?? subscription.agreedAmountPerCycle?.toString()} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold sm:col-span-2 lg:col-span-4 dark:border-zinc-700">Calculate preview</button></form>{annualPreview ? <dl className="mt-4 grid gap-3 rounded-lg bg-blue-50 p-4 text-sm sm:grid-cols-3 dark:bg-blue-950/30"><div><dt className="text-blue-700 dark:text-blue-300">Prorated preview</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(annualPreview.proratedAmount.toString(), annualPreview.currency)}</dd></div><div><dt className="text-blue-700 dark:text-blue-300">Remaining days</dt><dd className="mt-1 text-lg font-semibold">{annualPreview.remainingCalendarDays} / {annualPreview.totalCalendarDays}</dd></div><div><dt className="text-blue-700 dark:text-blue-300">Future recurring effective</dt><dd className="mt-1 text-lg font-semibold">{annualPreview.futureRecurringEffectiveDate}</dd></div></dl> : null}{annualPreviewError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{annualPreviewError}</p> : null}</section> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">History and financial references</h2><p className="mt-1 text-sm text-zinc-500">Existing references only. This screen does not create or alter invoices, payments, schedules, or provider links.</p><div className="mt-4 grid gap-5 lg:grid-cols-2"><div><h3 className="text-sm font-semibold">Native invoices</h3>{subscription.invoices.length ? <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">{subscription.invoices.map((invoice) => <li key={invoice.id} className="flex justify-between gap-3 py-2"><span>{invoice.number ?? "Draft/reference pending"} · <span className="capitalize">{invoice.status.replaceAll("_", " ")}</span></span><span className="tabular-nums">{money(invoice.total.toString(), currency)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No native financial references.</p>}</div><div><h3 className="text-sm font-semibold">Provider invoices</h3>{subscription.billingInvoices.length ? <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">{subscription.billingInvoices.map((invoice) => <li key={invoice.id} className="flex justify-between gap-3 py-2"><span>{invoice.displayNumber ?? invoice.providerInvoiceNumber ?? "Provider invoice"} · <span className="capitalize">{invoice.status.replaceAll("_", " ")}</span></span><span className="tabular-nums">{money(invoice.amountXcd.toString(), invoice.provider === "stripe" ? "XCD" : currency)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No provider financial references.</p>}</div></div></section>
    </div>
  );
}
