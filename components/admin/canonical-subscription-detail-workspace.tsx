import Link from "next/link";

import { activateManualPilotLocallyAction } from "@/app/admin/subscriptions/canonical/pilot/actions";
import { CanonicalManualActivationForm } from "@/components/admin/canonical-subscription-activation-form";
import { CanonicalSubscriptionCollectionForm } from "@/components/admin/canonical-subscription-collection-form";
import { CustomerServiceManagementModal } from "@/components/admin/customer-service-management-modal";
import {
  AddCanonicalDraftItemForm,
  EditCanonicalDraftItemForm,
  ScheduleCanonicalDraftItemEndForm,
  ScheduleCanonicalDraftRateForm,
} from "@/components/admin/canonical-subscription-draft-forms";
import {
  CanonicalServiceHardwareReplacementForm,
  CanonicalServiceTransferForm,
  CanonicalSubscriptionLifecycleForm,
} from "@/components/admin/canonical-subscription-operations-form";
import { CanonicalStripeAdoptionForm } from "@/components/admin/canonical-stripe-adoption-form";
import {
  canonicalIntervalLabel,
  canonicalProviderStatusLabel,
  canonicalSubscriptionDisplayName,
} from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import type { previewAnnualSubscriptionAddition } from "@/lib/services/canonical-subscription-application-service";
import type { getCanonicalSubscriptionAdminDetail } from "@/lib/services/canonical-subscription-admin-service";

type Subscription = NonNullable<Awaited<ReturnType<typeof getCanonicalSubscriptionAdminDetail>>>;
type AnnualPreview = Awaited<ReturnType<typeof previewAnnualSubscriptionAddition>>;

type Props = {
  subscription: Subscription;
  editable: boolean;
  canManage: boolean;
  nextBillingDate: string;
  previewQuery: { periodStart?: string; periodEnd?: string; activationDate?: string; annualAmount?: string; error?: string; pilot?: string };
  annualPreview: AnnualPreview | null;
  annualPreviewError: string | null;
  localPilotActivationAvailable: boolean;
  transferTargets: readonly { id: string; name: string | null; reference: string | null }[];
  replacementAssignments: readonly { id: string; device: { label: string | null; deviceModel: { name: string } } }[];
};

function iso(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? "";
}

function displayDate(value: Date | null | undefined) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) ?? "Not scheduled";
}

function money(value: string | number | null | undefined, currency = "XCD") {
  return value == null ? "â€”" : formatExpenseAmount(Number(value), currency);
}

function collectionLabel(value: string | null) {
  if (value === "stripe_autocharge") return "Card billing";
  if (value === "manual_invoice") return "Manual invoice";
  return "Not configured";
}

function authorityLabel(access: string) {
  if (access === "canonical_operational" || access === "editable_draft") return "Canonical";
  if (access.includes("shadow")) return "Source-controlled";
  return "Read-only";
}

function cycleUnit(months: number | null) {
  if (months === 1) return "month";
  if (months === 3) return "quarter";
  if (months === 6) return "6 months";
  if (months === 12) return "year";
  return "cycle";
}

export function CanonicalSubscriptionDetailWorkspace({
  subscription,
  editable,
  canManage,
  nextBillingDate,
  previewQuery,
  annualPreview,
  annualPreviewError,
  localPilotActivationAvailable,
  transferTargets,
  replacementAssignments,
}: Props) {
  const currency = subscription.currency ?? "XCD";
  const lifecycle = (subscription.lifecycleStatus ?? subscription.status).replaceAll("_", " ");
  const activeServices = subscription.items.filter((item) => !["ended", "canceled"].includes(item.status));
  const invoiceCount = subscription.invoices.length + subscription.billingInvoices.length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <header>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <Link href="/admin/subscriptions/canonical" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Subscriptions</Link>
          <span aria-hidden="true">/</span>
          <span>{subscription.customerLabel}</span>
        </div>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{subscription.customerLabel}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{canonicalSubscriptionDisplayName(subscription.name, subscription.billingIntervalMonths)}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              <span>{subscription.reference || "No commercial reference"}</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{lifecycle}</span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{collectionLabel(subscription.collectionMethod)}</span>
              <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">{authorityLabel(subscription.access)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/customers/${subscription.customerId}/subscriptions`} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">View customer</Link>
            <a href="#services" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">{canManage ? "Manage services" : "View services"}</a>
          </div>
        </div>
      </header>

      {previewQuery.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{previewQuery.error}</p> : null}
      {previewQuery.pilot === "activated" ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">The test billing transition completed. The prior schedule stopped for the exact source arrangement, and this subscription now owns future billing.</p> : null}

      {subscription.summary?.attentionRequired ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"><span className="font-semibold">Next action: review collection.</span> An open balance is beyond grace or a provider operation needs review. <Link href={`/admin/customers/${subscription.customerId}/billing`} className="font-semibold underline">Open billing</Link>.</div>
      ) : subscription.controlMode === "shadow" ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100"><span className="font-semibold">Next action: review source authority.</span> This record remains read-only until approved reconciliation or adoption.</div>
      ) : editable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><span className="font-semibold">Next action: complete setup and activation review.</span> This is an inactive draft; editing it does not activate billing or Stripe.</div>
      ) : null}

      <section id="overview" className="grid gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">
        <article className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Agreement summary</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div><dt className="text-zinc-500">Customer</dt><dd className="mt-1 font-medium">{subscription.customerLabel}</dd></div>
            <div><dt className="text-zinc-500">Billing interval</dt><dd className="mt-1 font-medium">{canonicalIntervalLabel(subscription.billingIntervalMonths)}</dd></div>
            <div><dt className="text-zinc-500">Start date</dt><dd className="mt-1 font-medium">{displayDate(subscription.commercialStartDate)}</dd></div>
            <div><dt className="text-zinc-500">Next renewal</dt><dd className="mt-1 font-medium">{displayDate(subscription.nextBillingDate)}</dd></div>
            <div><dt className="text-zinc-500">Grace period</dt><dd className="mt-1 font-medium">{subscription.gracePeriodDays} days</dd></div>
            <div><dt className="text-zinc-500">Authority</dt><dd className="mt-1 font-medium">{authorityLabel(subscription.access)}</dd></div>
          </dl>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Financial summary</h2>
          <p className="mt-4 text-sm text-zinc-500">Monthly recurring value</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{money(subscription.normalizedMrr, currency)}</p>
          <p className="mt-1 text-xs text-zinc-500">Normalized from {activeServices.length} current service{activeServices.length === 1 ? "" : "s"}</p>
          <div className="my-4 border-t border-zinc-100 dark:border-zinc-800" />
          <p className="text-sm text-zinc-500">Next cycle total</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{money(subscription.summary?.recurringCycleTotal, currency)}</p>
          <p className="mt-1 text-xs text-zinc-500">Due {displayDate(subscription.nextBillingDate)}</p>
          <p className="mt-4 text-sm"><span className="text-zinc-500">Collection health</span><span className="ml-2 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{subscription.summary?.collectionHealth.replaceAll("_", " ") ?? "Unknown"}</span></p>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-4 grid gap-2 text-sm">
            <a href="#services" className="rounded-lg border border-zinc-200 px-3 py-3 font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">{canManage ? "+ Add or manage service" : "View billable services"}</a>
            <Link href={`/admin/customers/${subscription.customerId}/billing`} className="rounded-lg border border-zinc-200 px-3 py-3 font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">View billing history</Link>
            <Link href="/admin/devices" className="rounded-lg border border-zinc-200 px-3 py-3 font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Device inventory</Link>
            <a href="#history" className="rounded-lg border border-zinc-200 px-3 py-3 font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Provider and audit details</a>
          </div>
        </article>
      </section>

      <section id="services" className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div><h2 className="text-lg font-semibold">GPS services ({subscription.items.length})</h2><p className="mt-1 text-sm text-zinc-500">One row per commercial service, with its actual cycle rate and current hardware.</p></div>
          {canManage ? <a href="#advanced-management" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Add GPS service</a> : null}
        </div>
        {subscription.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Service / description</th><th className="px-4 py-3">Device</th><th className="px-4 py-3">SIM</th><th className="px-4 py-3">Actual rate</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {subscription.items.map((item, index) => {
                  const rate = item.rates.at(-1);
                  const assignment = item.serviceAssignments.find((entry) => entry.endDate == null && entry.status !== "cancelled") ?? item.serviceAssignments.at(-1);
                  const device = assignment?.device;
                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-4 text-zinc-500">{index + 1}</td>
                      <td className="px-4 py-4"><p className="font-semibold">{item.label || `Service ${index + 1}`}</p><p className="mt-1 text-xs text-zinc-500">Effective {displayDate(item.billingEffectiveFrom)}</p></td>
                      <td className="px-4 py-4">{device ? <><Link href={`/admin/devices/${device.id}/edit?tab=assignment`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{device.label?.trim() || device.deviceModel.name}</Link><p className="mt-1 text-xs text-zinc-500">{device.imei || device.deviceModel.name}</p></> : <span className="text-zinc-500">Not assigned</span>}</td>
                      <td className="px-4 py-4">{device?.simCard ? <Link href={`/admin/sims/${device.simCard.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{device.simCard.label || device.simCard.iccid}</Link> : <span className="text-zinc-500">Not assigned</span>}</td>
                      <td className="px-4 py-4"><p className="font-semibold tabular-nums">{rate ? `${money(rate.agreedAmountPerCycle.toString(), rate.currency)} / ${cycleUnit(rate.billingIntervalMonths)}` : "Not set"}</p>{rate && rate.billingIntervalMonths !== 1 ? <p className="mt-1 text-xs text-zinc-500">{money(Number(rate.agreedAmountPerCycle) / rate.billingIntervalMonths, rate.currency)} / month equivalent</p> : null}</td>
                      <td className="px-4 py-4"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{item.status.replaceAll("_", " ")}</span></td>
                      <td className="px-4 py-4 text-right">{canManage ? <CustomerServiceManagementModal subscriptionId={subscription.id} subscriptionItemId={item.id} serviceLabel={item.label || `Service ${index + 1}`} nextBillingDate={nextBillingDate} currentAmount={rate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00"} draftItem={editable ? { label: item.label ?? "", notes: item.notes ?? "", serviceActivatedDate: iso(item.serviceActivatedDate), billingEffectiveFrom: iso(item.billingEffectiveFrom) } : null} replacementAssignments={replacementAssignments.map((candidate) => ({ id: candidate.id, label: candidate.device.label?.trim() || candidate.device.deviceModel.name }))} targetSubscriptions={transferTargets.map((target) => ({ id: target.id, label: target.name?.trim() || target.reference || "Subscription agreement" }))} assignment={assignment && assignment.endDate == null && assignment.status !== "cancelled" && device ? { id: assignment.id, deviceId: device.id, deviceLabel: device.label?.trim() || device.deviceModel.name, status: assignment.status } : null} /> : <a href={`#history-${item.id}`} className="inline-flex rounded-lg border border-zinc-300 px-3 py-2 font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">View history</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="p-10 text-center text-sm text-zinc-500">No billable services have been added.</div>}
      </section>

      <section id="billing" className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold">Billing & renewal</h2><p className="mt-1 text-sm text-zinc-500">Cycle totals come from effective service rates. MRR is shown separately as a normalized comparison.</p></div><Link href={`/admin/customers/${subscription.customerId}/billing`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Open Customer Billing</Link></div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Cycle total</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.summary?.recurringCycleTotal, currency)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">MRR equivalent</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.normalizedMrr, currency)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Next billing</dt><dd className="mt-1 font-semibold">{displayDate(subscription.nextBillingDate)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Collection</dt><dd className="mt-1 font-semibold">{collectionLabel(subscription.collectionMethod)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Outstanding</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.summary?.outstandingBalance, currency)}</dd></div>
        </dl>
        {subscription.summary?.validationIssues.length ? <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20"><summary className="cursor-pointer font-semibold text-amber-900 dark:text-amber-200">Billing readiness issues ({subscription.summary.validationIssues.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900 dark:text-amber-200">{subscription.summary.validationIssues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul></details> : null}
      </section>

      <section id="invoices" className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Invoices</h2><p className="mt-1 text-sm text-zinc-500">Native and provider references are shown separately to avoid double-counting.</p></div><span className="text-sm font-semibold">{invoiceCount} record{invoiceCount === 1 ? "" : "s"}</span></div>
        <div className="mt-4 grid gap-5 lg:grid-cols-2"><div><h3 className="text-sm font-semibold">Native invoices</h3>{subscription.invoices.length ? <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">{subscription.invoices.map((invoice) => <li key={invoice.id} className="flex justify-between gap-3 py-2"><span>{invoice.number ?? "Draft/reference pending"} Â· <span className="capitalize">{invoice.status.replaceAll("_", " ")}</span></span><span className="text-right tabular-nums">{money(invoice.total.toString(), currency)}<span className="block text-xs text-zinc-500">Due {money(invoice.amountDue.toString(), currency)}</span></span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No invoices are directly linked to this agreement. Older activity may be in Customer Billing.</p>}</div><div><h3 className="text-sm font-semibold">Provider invoices</h3>{subscription.billingInvoices.length ? <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">{subscription.billingInvoices.map((invoice) => <li key={invoice.id} className="flex justify-between gap-3 py-2"><span>{invoice.displayNumber ?? invoice.providerInvoiceNumber ?? "Provider invoice"} Â· <span className="capitalize">{invoice.status.replaceAll("_", " ")}</span></span><span className="tabular-nums">{money(invoice.amountXcd.toString(), invoice.provider === "stripe" ? "XCD" : currency)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No provider financial references.</p>}</div></div>
      </section>

      <section id="history" className="space-y-3">
        <h2 className="text-lg font-semibold">Advanced management & history</h2>{canManage ? <details id="advanced-management" className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Agreement lifecycle and service setup</summary><div className="mt-5 space-y-5"><CanonicalSubscriptionLifecycleForm subscriptionId={subscription.id} lifecycleStatus={subscription.lifecycleStatus ?? ""} /><AddCanonicalDraftItemForm subscriptionId={subscription.id} nextBillingDate={nextBillingDate} defaultAmount={subscription.agreedAmountPerCycle?.toString() ?? "0.00"} /></div></details> : null}
        <details className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Service price and hardware history</summary><div className="mt-5 space-y-3">{subscription.items.map((item) => <article id={`history-${item.id}`} key={item.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"><h3 className="font-semibold">{item.label || "Tracking service"}</h3><div className="mt-3 grid gap-5 lg:grid-cols-2"><div><h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Price history</h4>{item.rates.length ? <ul className="mt-2 space-y-2 text-sm">{item.rates.map((rate) => <li key={rate.id} className="flex flex-col justify-between gap-1 rounded-lg bg-zinc-50 px-3 py-2 sm:flex-row dark:bg-zinc-950"><span className="font-medium tabular-nums">{money(rate.agreedAmountPerCycle.toString(), rate.currency)} / {cycleUnit(rate.billingIntervalMonths)} Â· <span className="capitalize">{rate.classification}</span></span><span className="text-zinc-500">{displayDate(rate.effectiveFrom)} to {displayDate(rate.effectiveUntil)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No price history.</p>}</div><div><h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hardware assignments</h4>{item.serviceAssignments.length ? <ul className="mt-2 space-y-2 text-sm">{item.serviceAssignments.map((assignment) => <li key={assignment.id} className="flex flex-col justify-between gap-1 sm:flex-row"><span>{assignment.device.label?.trim() || assignment.device.deviceModel.name} Â· <span className="capitalize text-zinc-500">{assignment.status.replaceAll("_", " ")}</span></span><span className="text-zinc-500">{displayDate(assignment.startDate)} to {displayDate(assignment.endDate)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No linked device history.</p>}</div></div></article>)}</div></details>

        <details className="rounded-xl border border-sky-200 bg-sky-50/50 p-5 dark:border-sky-900 dark:bg-sky-950/20"><summary className="cursor-pointer font-semibold">Provider relationship and operations Â· {canonicalProviderStatusLabel(subscription.providerStatus)}</summary><p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Local relationship and operation history only. This does not claim live Stripe state.</p><div className="mt-4 space-y-2">{subscription.providerLinks.length ? subscription.providerLinks.map((link) => <div key={link.id} className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-900"><div className="flex flex-col justify-between gap-1 sm:flex-row"><span className="font-medium">{String(link.provider).toUpperCase()} Â· {link.externalSubscriptionId}</span><span className="capitalize text-zinc-500">{link.providerStatus || "status not recorded"}{link.endedAt ? " Â· ended" : " Â· open"}</span></div>{link.lastError ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{link.lastError}</p> : null}</div>) : <p className="text-sm text-zinc-500">No provider relationship is recorded.</p>}{subscription.billingOperations.map((operation) => <div key={operation.id} className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-900"><div className="flex justify-between gap-3"><span className="font-medium capitalize">{String(operation.type).replaceAll("_", " ")}</span><span className="capitalize text-zinc-500">{String(operation.status).replaceAll("_", " ")}</span></div>{operation.failureMessage ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{operation.failureMessage}</p> : null}</div>)}</div></details>

        {subscription.operationalActivation ? <details className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Activation record</summary><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-zinc-500">First billing</dt><dd className="mt-1 font-medium">{subscription.operationalActivation.initialBillingMode === "advance_invoice" ? "Initial invoice issued" : "Explicitly deferred"}</dd></div><div><dt className="text-zinc-500">First coverage</dt><dd className="mt-1 font-medium">{displayDate(subscription.operationalActivation.initialPeriodStart)} to {displayDate(subscription.operationalActivation.initialPeriodEnd)}</dd></div><div><dt className="text-zinc-500">Approved by</dt><dd className="mt-1 font-medium">{subscription.operationalActivation.approvedBy.name || subscription.operationalActivation.approvedBy.email}</dd></div><div><dt className="text-zinc-500">Activated</dt><dd className="mt-1 font-medium">{displayDate(subscription.operationalActivation.performedAt)}</dd></div></dl></details> : null}

        {editable && subscription.controlMode === "canonical" ? <details open className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900 dark:bg-amber-950/20"><summary className="cursor-pointer font-semibold">Draft activation and collection review</summary><div className="mt-4">{subscription.collectionMethod === "manual_invoice" ? <CanonicalManualActivationForm subscriptionId={subscription.id} commercialStartDate={iso(subscription.commercialStartDate)} nextBillingDate={nextBillingDate} gracePeriodDays={subscription.gracePeriodDays} cycleTotal={subscription.summary?.recurringCycleTotal ?? null} serviceCount={subscription.items.length} /> : <p className="rounded-lg border border-blue-200 bg-white p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-zinc-900 dark:text-blue-100">Only the existing isolated test-provider Checkout workflow is available. Live Stripe remains default-deny.</p>}{subscription.collectionMethod ? <div className="mt-5"><CanonicalSubscriptionCollectionForm subscriptionId={subscription.id} value={subscription.collectionMethod} /></div> : null}</div></details> : null}

        {subscription.controlMode === "shadow" && subscription.collectionMethod === "stripe_autocharge" ? <details open className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900 dark:bg-blue-950/20"><summary className="cursor-pointer font-semibold">Stripe adoption review</summary><div className="mt-4"><CanonicalStripeAdoptionForm subscriptionId={subscription.id} serviceCount={subscription.items.length} cycleTotal={subscription.summary?.recurringCycleTotal ?? null} nextBillingDate={displayDate(subscription.nextBillingDate)} /></div></details> : null}

        {subscription.billingIntervalMonths === 12 && subscription.controlMode !== "legacy" ? <details className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Annual addition and adjustment preview</summary><p className="mt-2 text-sm text-zinc-500">Preview only. This does not authorize collection or advance the recurring schedule.</p><form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium">Period start<input required type="date" name="periodStart" defaultValue={previewQuery.periodStart ?? iso(subscription.billingAnchorDate)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Period end<input required type="date" name="periodEnd" defaultValue={previewQuery.periodEnd ?? nextBillingDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Activation date<input required type="date" name="activationDate" defaultValue={previewQuery.activationDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Annual amount<input name="annualAmount" inputMode="decimal" defaultValue={previewQuery.annualAmount ?? subscription.agreedAmountPerCycle?.toString()} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold sm:col-span-2 lg:col-span-4 dark:border-zinc-700">Calculate preview</button></form>{annualPreview ? <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100">Prorated preview: {money(annualPreview.proratedAmount.toString(), annualPreview.currency)} Â· effective {annualPreview.futureRecurringEffectiveDate}</p> : null}{annualPreviewError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{annualPreviewError}</p> : null}</details> : null}

        {(subscription.canonicalMigrationLedger?.sourceKind === "manual_schedule" || subscription.canonicalMigrationLedger?.sourceKind === "manual_invoice") ? <details className="rounded-xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20"><summary className="cursor-pointer font-semibold">Manual pilot authority transfer</summary>{subscription.manualPilotReview ? <><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-zinc-500">Billing source</dt><dd className="mt-1 font-medium capitalize">{subscription.manualPilotReview.proposal.sourceKind.replaceAll("_", " ")}</dd></div><div><dt className="text-zinc-500">Cutover period</dt><dd className="mt-1 font-medium">{subscription.manualPilotReview.proposal.cutoverPeriodStart}</dd></div><div><dt className="text-zinc-500">Approved recurring total</dt><dd className="mt-1 font-medium">{money(subscription.manualPilotReview.proposal.recurringAmount, subscription.manualPilotReview.proposal.currency)}</dd></div><div><dt className="text-zinc-500">Historical outstanding</dt><dd className="mt-1 font-medium">{money(subscription.manualPilotReview.proposal.outstandingBalance, subscription.manualPilotReview.proposal.currency)}</dd></div></dl>{localPilotActivationAvailable ? <form action={activateManualPilotLocallyAction} className="mt-5 space-y-3 rounded-lg border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-zinc-900"><input type="hidden" name="subscriptionId" value={subscription.id} /><label className="block text-sm font-medium">Synthetic approval reason<textarea required name="approvalReason" rows={3} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><div className="grid gap-2 text-sm sm:grid-cols-2">{[["confirmCustomer", "Customer identity confirmed"], ["confirmTerms", "Commercial terms confirmed"], ["confirmBalances", "Historical balances reconciled"], ["confirmLegacyStop", "Exact legacy schedule will stop"], ["confirmCanonicalStart", "Subscription schedule will start"], ["confirmRecovery", "Recovery procedure reviewed"]].map(([name, label]) => <label key={name} className="flex items-start gap-2"><input required type="checkbox" name={name} value="yes" className="mt-1" /><span>{label}</span></label>)}</div><button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Activate synthetic manual pilot</button></form> : <p className="mt-4 text-xs text-zinc-500">Production cutover controls remain unavailable without the separately approved pilot configuration.</p>}</> : <p className="mt-4 text-sm text-zinc-500">{subscription.manualPilotReviewError ?? "Pilot readiness is unavailable."}</p>}</details> : null}
      </section>
    </div>
  );
}
