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
import { SubscriptionAdjustmentInvoiceForm } from "@/components/admin/subscription-adjustment-invoice-form";
import { canonicalAnnualAdjustmentExecutionEnabled } from "@/lib/domain/canonical-annual-adjustment";
import { cadenceLabel, cycleUnitLabel } from "@/lib/domain/subscription-proration";
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
  return value == null ? "—" : formatExpenseAmount(Number(value), currency);
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

function adjustmentMethodLabel(method: string) {
  if (method === "monthly_rounded") return "Agreed by rounded months";
  if (method === "manual_amount") return "Agreed amount";
  return "Daily proration";
}

function ServiceTiming({ item }: { item: Subscription["items"][number] }) {
  return (
    <p className="mt-1 text-xs text-zinc-500">
      {item.serviceActivatedDate ? `Started ${displayDate(item.serviceActivatedDate)} · ` : ""}bills from {displayDate(item.billingEffectiveFrom)}
      {item.initialAdjustment ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{item.initialAdjustment.invoice ? "partial period invoiced" : "partial period agreed, not invoiced"}</span> : null}
    </p>
  );
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
  const isActivationDraft = editable && subscription.controlMode === "canonical";
  const canAddService = canManage
    && subscription.controlMode === "canonical"
    && ["pending_activation", "active", "paused"].includes(subscription.lifecycleStatus ?? "");
  const adjustmentRows = activeServices.flatMap((item) => item.initialAdjustment
    ? [{ item, adjustment: item.initialAdjustment, status: subscription.adjustmentStatuses.find((entry) => entry.itemId === item.id) ?? null }]
    : []);
  const adjustmentExecutionEnabled = canonicalAnnualAdjustmentExecutionEnabled();
  const serviceDetailsReady = activeServices.length > 0 && activeServices.every((item) => item.rates.length > 0);
  const hardwareReady = activeServices.length > 0 && activeServices.every((item) => item.serviceAssignments.some((assignment) => assignment.endDate == null && assignment.status !== "cancelled"));
  const billingReady = Boolean(subscription.collectionMethod && subscription.nextBillingDate);
  const readinessComplete = serviceDetailsReady && hardwareReady && billingReady;
  const readinessItems = [
    { label: "Service details confirmed", detail: `${activeServices.length} billable service${activeServices.length === 1 ? "" : "s"} with current pricing`, complete: serviceDetailsReady },
    { label: "Hardware assigned", detail: hardwareReady ? "Every current service has an active device" : "Assign a device to every current service", complete: hardwareReady },
    { label: "Billing decision selected", detail: billingReady ? `${collectionLabel(subscription.collectionMethod)} · renews ${displayDate(subscription.nextBillingDate)}` : "Choose a collection method and renewal date", complete: billingReady },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 text-zinc-950 dark:text-zinc-50">
      <header>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <Link href="/admin/subscriptions/canonical" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Subscriptions</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/admin/customers/${subscription.customerId}/subscriptions`} className="hover:underline">{subscription.customerLabel}</Link>
        </div>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{subscription.customerLabel}</h1>
            <p className="mt-1 text-sm text-zinc-500">{canonicalSubscriptionDisplayName(subscription.name, subscription.billingIntervalMonths)}{subscription.reference ? ` · ${subscription.reference}` : ""}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{isActivationDraft ? "Draft" : lifecycle}</span>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">{canonicalIntervalLabel(subscription.billingIntervalMonths)}</span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{collectionLabel(subscription.collectionMethod)}</span>
              {authorityLabel(subscription.access) !== "Canonical" ? <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">{authorityLabel(subscription.access)}</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canAddService ? <Link href={`/admin/subscriptions/canonical/${subscription.id}/add-service`} className="min-h-11 flex-1 rounded-lg bg-emerald-700 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-800 sm:flex-none">Add service</Link> : null}
            <details className="relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800" aria-label="More actions">More ▾</summary>
              <div className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-1 rounded-xl border border-zinc-200 bg-white p-2 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <Link href={`/admin/customers/${subscription.customerId}/subscriptions`} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">View customer</Link>
                <Link href={`/admin/billing?q=${subscription.id}`} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">Invoices &amp; payments</Link>
                <a href="#advanced" className="block rounded-lg px-3 py-2.5 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">History</a>
                {canManage ? <a href="#advanced" className="block rounded-lg px-3 py-2.5 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">Pause, end or change billing</a> : null}
                <Link href={`/admin/subscriptions/canonical/new?customerId=${subscription.customerId}`} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">New separate subscription for this customer</Link>
              </div>
            </details>
          </div>
        </div>
      </header>

      {previewQuery.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{previewQuery.error}</p> : null}
      {previewQuery.pilot === "activated" ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">The test billing transition completed. The prior schedule stopped for the exact source arrangement, and this subscription now owns future billing.</p> : null}

      {subscription.siblings.length > 1 ? (
        <nav aria-label="Customer subscriptions" className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">This customer has {subscription.siblings.length} subscriptions — each bills on its own schedule</p>
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {subscription.siblings.map((sibling) => (
              <li key={sibling.id} className="shrink-0">
                <Link href={`/admin/subscriptions/canonical/${sibling.id}`} aria-current={sibling.isCurrent ? "page" : undefined} className={`block rounded-lg border px-3 py-2 text-sm ${sibling.isCurrent ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}>
                  <span className="block font-semibold">{cadenceLabel(sibling.billingIntervalMonths)} · {sibling.serviceCount} service{sibling.serviceCount === 1 ? "" : "s"}</span>
                  <span className="block text-xs text-zinc-500">{sibling.nextBillingDate ? `Renews ${displayDate(sibling.nextBillingDate)}` : "No renewal date"} · {(sibling.lifecycleStatus ?? "unclassified").replaceAll("_", " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {subscription.summary?.attentionRequired ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"><span className="font-semibold">Next action: review collection.</span> An open balance is beyond grace or a provider operation needs review. <Link href={`/admin/billing?q=${subscription.id}`} className="font-semibold underline">Open billing</Link>.</div>
      ) : subscription.controlMode === "shadow" ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100"><span className="font-semibold">Next action: review source authority.</span> This record remains read-only until approved reconciliation or adoption.</div>
      ) : null}

      <section id="overview" aria-label="Subscription summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Recurring total</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(subscription.summary?.recurringCycleTotal, currency)}</p><p className="text-xs text-zinc-500">per {cycleUnitLabel(subscription.billingIntervalMonths)}, this subscription only</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Next renewal</p><p className="mt-1 text-xl font-semibold">{displayDate(subscription.nextBillingDate)}</p><p className="text-xs text-zinc-500">{activeServices.length} current service{activeServices.length === 1 ? "" : "s"}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Billing method</p><p className="mt-1 text-xl font-semibold">{collectionLabel(subscription.collectionMethod)}</p><p className="text-xs text-zinc-500">{subscription.collectionMethod === "manual_invoice" ? `Grace ${subscription.gracePeriodDays} days` : subscription.collectionMethod === "stripe_autocharge" ? canonicalProviderStatusLabel(subscription.providerStatus) : "Not configured"}</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs text-zinc-500">Outstanding</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(subscription.summary?.outstandingBalance, currency)}</p><p className="text-xs text-zinc-500">{invoiceCount} invoice record{invoiceCount === 1 ? "" : "s"}</p></div>
      </section>

      {isActivationDraft ? <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex items-start gap-3"><span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full text-lg font-bold text-white ${readinessComplete ? "bg-emerald-700" : "bg-amber-600"}`}>{readinessComplete ? "✓" : "!"}</span><div><h2 className="text-lg font-semibold">Readiness checklist</h2><p className="mt-1 text-sm text-zinc-500">{readinessComplete ? "All required items are complete. You can now activate this subscription." : "Finish the remaining setup before activation."}</p></div></div><ul className="mt-5 grid gap-3">{readinessItems.map((item) => <li key={item.label} className={`flex items-center gap-3 rounded-lg border p-4 ${item.complete ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"}`}><span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${item.complete ? "bg-emerald-700" : "bg-amber-600"}`}>{item.complete ? "✓" : "!"}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.label}</strong><span className="mt-0.5 block text-xs text-zinc-500">{item.detail}</span></span><span className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${item.complete ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>{item.complete ? "Complete" : "Required"}</span></li>)}</ul></section> : null}

      {isActivationDraft ? <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div><h2 className="text-lg font-semibold">Initial billing decision</h2><p className="mt-1 text-sm text-zinc-500">Choose how to handle the first service period, then complete the activation review.</p></div>{subscription.collectionMethod === "manual_invoice" ? <CanonicalManualActivationForm subscriptionId={subscription.id} commercialStartDate={iso(subscription.commercialStartDate)} nextBillingDate={nextBillingDate} gracePeriodDays={subscription.gracePeriodDays} cycleTotal={subscription.summary?.recurringCycleTotal ?? null} serviceCount={subscription.items.length} billingIntervalMonths={subscription.billingIntervalMonths} /> : <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100">Only the isolated test-provider Checkout workflow is available. Live Stripe remains default-deny.</p>}{subscription.collectionMethod ? <details className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"><summary className="cursor-pointer text-sm font-semibold">Change collection method</summary><CanonicalSubscriptionCollectionForm subscriptionId={subscription.id} value={subscription.collectionMethod} /></details> : null}</section> : null}

      <section id="services" className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <div><h2 className="text-lg font-semibold">Billable services ({subscription.items.length})</h2><p className="mt-1 text-sm text-zinc-500">One row per service, with its own price per billing cycle and current hardware.</p></div>
          {canAddService ? <Link href={`/admin/subscriptions/canonical/${subscription.id}/add-service`} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-800">Add service</Link> : null}
        </div>
        {subscription.items.length ? (
          <>
          <div className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
            {subscription.items.map((item, index) => {
              const rate = item.rates.at(-1);
              const assignment = item.serviceAssignments.find((entry) => entry.endDate == null && entry.status !== "cancelled") ?? item.serviceAssignments.at(-1);
              const device = assignment?.device;
              return <article key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{item.label || `Service ${index + 1}`}</h3><ServiceTiming item={item} /></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{item.status.replaceAll("_", " ")}</span></div><dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-zinc-500">Device</dt><dd className="mt-1 font-medium">{device ? device.label?.trim() || device.deviceModel.name : "Not assigned"}</dd>{device?.imei ? <dd className="mt-0.5 break-all text-xs text-zinc-500">{device.imei}</dd> : null}</div><div><dt className="text-xs text-zinc-500">Actual rate</dt><dd className="mt-1 font-semibold tabular-nums">{rate ? `${money(rate.agreedAmountPerCycle.toString(), rate.currency)} / ${cycleUnit(rate.billingIntervalMonths)}` : "Not set"}</dd></div></dl><div className="mt-4">{canManage ? <CustomerServiceManagementModal subscriptionId={subscription.id} subscriptionItemId={item.id} serviceLabel={item.label || `Service ${index + 1}`} nextBillingDate={nextBillingDate} currentAmount={rate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00"} replacementAssignments={replacementAssignments.map((candidate) => ({ id: candidate.id, label: candidate.device.label?.trim() || candidate.device.deviceModel.name }))} targetSubscriptions={transferTargets.map((target) => ({ id: target.id, label: target.name?.trim() || target.reference || "Subscription agreement" }))} assignment={assignment && assignment.endDate == null && assignment.status !== "cancelled" && device ? { id: assignment.id, deviceId: device.id, deviceLabel: device.label?.trim() || device.deviceModel.name, status: assignment.status } : null} /> : <a href={`#history-${item.id}`} className="inline-flex rounded-lg border border-zinc-300 px-3 py-2 font-semibold">View history</a>}</div></article>;
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
                      <td className="px-4 py-4"><p className="font-semibold">{item.label || `Service ${index + 1}`}</p><ServiceTiming item={item} /></td>
                      <td className="px-4 py-4">{device ? <><Link href={`/admin/devices/${device.id}/edit?tab=assignment`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{device.label?.trim() || device.deviceModel.name}</Link><p className="mt-1 text-xs text-zinc-500">{device.imei || device.deviceModel.name}</p></> : <span className="text-zinc-500">Not assigned</span>}</td>
                      <td className="px-4 py-4">{device?.simCard ? <Link href={`/admin/sims/${device.simCard.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{device.simCard.label || device.simCard.iccid}</Link> : <span className="text-zinc-500">Not assigned</span>}</td>
                      <td className="px-4 py-4"><p className="font-semibold tabular-nums">{rate ? `${money(rate.agreedAmountPerCycle.toString(), rate.currency)} / ${cycleUnit(rate.billingIntervalMonths)}` : "Not set"}</p>{rate && rate.billingIntervalMonths !== 1 ? <p className="mt-1 text-xs text-zinc-500">{money(Number(rate.agreedAmountPerCycle) / rate.billingIntervalMonths, rate.currency)} / month equivalent</p> : null}</td>
                      <td className="px-4 py-4"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{item.status.replaceAll("_", " ")}</span></td>
                      <td className="px-4 py-4 text-right">{canManage ? <CustomerServiceManagementModal subscriptionId={subscription.id} subscriptionItemId={item.id} serviceLabel={item.label || `Service ${index + 1}`} nextBillingDate={nextBillingDate} currentAmount={rate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00"} replacementAssignments={replacementAssignments.map((candidate) => ({ id: candidate.id, label: candidate.device.label?.trim() || candidate.device.deviceModel.name }))} targetSubscriptions={transferTargets.map((target) => ({ id: target.id, label: target.name?.trim() || target.reference || "Subscription agreement" }))} assignment={assignment && assignment.endDate == null && assignment.status !== "cancelled" && device ? { id: assignment.id, deviceId: device.id, deviceLabel: device.label?.trim() || device.deviceModel.name, status: assignment.status } : null} /> : <a href={`#history-${item.id}`} className="inline-flex rounded-lg border border-zinc-300 px-3 py-2 font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">View history</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ) : <div className="p-10 text-center text-sm text-zinc-500">No billable services have been added.</div>}
      </section>

      {adjustmentRows.length ? (
        <section id="agreed-charges" className="rounded-xl border border-amber-200 bg-white p-5 dark:border-amber-900 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">Agreed partial-period charges</h2>
          <p className="mt-1 text-sm text-zinc-500">Amounts agreed for the time between a service starting and joining the renewal. They are separate from the recurring total and are never assumed to be invoiced or paid.</p>
          <ul className="mt-4 space-y-3">
            {adjustmentRows.map(({ item, adjustment, status }) => {
              const invoice = adjustment.invoice;
              const adjustmentCurrency = adjustment.currency;
              const amountLabel = money(adjustment.amount.toString(), adjustmentCurrency);
              const monthlyEquivalent = adjustment.roundedMonths != null && subscription.billingIntervalMonths
                ? Number(adjustment.cycleAmount) / subscription.billingIntervalMonths
                : null;
              return (
                <li key={adjustment.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.label || "Tracking service"} — <span className="tabular-nums">{amountLabel}</span></p>
                      <p className="mt-1 text-sm text-zinc-500">{displayDate(adjustment.periodStart)} to {displayDate(adjustment.periodEnd)} · {adjustmentMethodLabel(adjustment.method)}</p>
                      {adjustment.roundedMonths != null && monthlyEquivalent != null ? <p className="mt-1 text-xs text-zinc-500">{adjustment.roundedMonths} month{adjustment.roundedMonths === 1 ? "" : "s"} × {money(monthlyEquivalent, adjustmentCurrency)}</p> : null}
                      {adjustment.method === "manual_amount" || (adjustment.method === "monthly_rounded" && Number(adjustment.dailyAmount) !== Number(adjustment.amount)) ? <p className="mt-1 text-xs text-zinc-500">Daily formula would be {money(adjustment.dailyAmount.toString(), adjustmentCurrency)}. The agreed amount is a deliberate override{adjustment.reason ? `: ${adjustment.reason}` : "."}</p> : null}
                    </div>
                    <span className={`mt-2 shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:mt-0 ${invoice ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{invoice ? "Invoiced" : "Agreed · not invoiced"}</span>
                  </div>
                  {invoice ? (
                    <p className="mt-3 text-sm"><Link href={`/admin/invoices/${invoice.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">{invoice.number ?? "Invoice"}</Link> · <span className="capitalize">{invoice.status.replaceAll("_", " ")}</span> · paid {money(invoice.amountPaid.toString(), adjustmentCurrency)} · due {money(invoice.amountDue.toString(), adjustmentCurrency)}</p>
                  ) : canManage && status?.proposal && status.status === "preview_available" ? (
                    adjustmentExecutionEnabled ? (
                      <SubscriptionAdjustmentInvoiceForm subscriptionId={subscription.id} subscriptionItemId={item.id} generationKey={status.proposal.generationKey} confirmationToken={status.proposal.confirmationToken} amountLabel={amountLabel} />
                    ) : (
                      <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">No invoice exists for this charge. Creating invoices from here is not enabled in this environment, so nothing has been billed.</p>
                    )
                  ) : status && status.status === "blocked" ? (
                    <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{status.message}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <details id="advanced" open={!canManage} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
        <summary className="cursor-pointer text-base font-semibold">Advanced details <span className="ml-1 text-sm font-normal text-zinc-500">billing, invoices, history, provider</span></summary>
        <div className="mt-4 space-y-4">
      {canManage ? (
        <details id="service-management" className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <summary className="cursor-pointer text-base font-semibold">Service and agreement management</summary>
          <p className="mt-2 text-sm text-zinc-500">Changes use the existing guarded workflows and do not rewrite historical invoices or silently mutate provider state.</p>
          <div className="mt-5"><CanonicalSubscriptionLifecycleForm subscriptionId={subscription.id} lifecycleStatus={subscription.lifecycleStatus ?? ""} /></div>
          <div className="mt-5 space-y-3">
            {activeServices.map((item) => {
              const rate = item.rates.at(-1);
              return <details id={`manage-${item.id}`} key={item.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"><summary className="cursor-pointer font-semibold">Manage {item.label || "tracking service"}</summary><div className="mt-4 grid gap-5 lg:grid-cols-2">{editable ? <div className="lg:col-span-2"><EditCanonicalDraftItemForm item={{ id: item.id, subscriptionId: subscription.id, label: item.label ?? "", notes: item.notes ?? "", serviceActivatedDate: iso(item.serviceActivatedDate), billingEffectiveFrom: iso(item.billingEffectiveFrom) }} /></div> : null}<ScheduleCanonicalDraftRateForm itemId={item.id} subscriptionId={subscription.id} nextBillingDate={nextBillingDate} currentAmount={rate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00"} /><ScheduleCanonicalDraftItemEndForm itemId={item.id} subscriptionId={subscription.id} /><CanonicalServiceHardwareReplacementForm subscriptionId={subscription.id} subscriptionItemId={item.id} assignments={replacementAssignments.map((assignment) => ({ id: assignment.id, label: assignment.device.label?.trim() || assignment.device.deviceModel.name }))} /><CanonicalServiceTransferForm subscriptionId={subscription.id} subscriptionItemId={item.id} currentAmount={rate?.agreedAmountPerCycle.toString() ?? subscription.agreedAmountPerCycle?.toString() ?? "0.00"} targetSubscriptions={transferTargets.map((target) => ({ id: target.id, label: target.name?.trim() || target.reference || "Subscription agreement" }))} /></div></details>;
            })}
          </div>
          <div className="mt-5"><AddCanonicalDraftItemForm subscriptionId={subscription.id} nextBillingDate={nextBillingDate} defaultAmount={subscription.agreedAmountPerCycle?.toString() ?? "0.00"} /></div>
        </details>
      ) : null}

      <details id="billing" className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer text-base font-semibold">Billing & renewal</summary>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><p className="text-sm text-zinc-500">Cycle totals come from effective service rates. MRR is shown separately as a normalized comparison.</p><Link href={`/admin/billing?q=${subscription.id}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Open subscription billing</Link></div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Cycle total</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.summary?.recurringCycleTotal, currency)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">MRR equivalent</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.normalizedMrr, currency)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Next billing</dt><dd className="mt-1 font-semibold">{displayDate(subscription.nextBillingDate)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Collection</dt><dd className="mt-1 font-semibold">{collectionLabel(subscription.collectionMethod)}</dd></div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950"><dt className="text-xs text-zinc-500">Outstanding</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(subscription.summary?.outstandingBalance, currency)}</dd></div>
        </dl>
        {subscription.summary?.validationIssues.length ? <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20"><summary className="cursor-pointer font-semibold text-amber-900 dark:text-amber-200">Billing readiness issues ({subscription.summary.validationIssues.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900 dark:text-amber-200">{subscription.summary.validationIssues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul></details> : null}
      </details>

      <details id="invoices" className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer text-base font-semibold">Invoices <span className="ml-2 text-sm font-normal text-zinc-500">{invoiceCount} record{invoiceCount === 1 ? "" : "s"}</span></summary>
        <p className="mt-3 text-sm text-zinc-500">Native and provider references are shown separately to avoid double-counting.</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2"><div><h3 className="text-sm font-semibold">Native invoices</h3>{subscription.invoices.length ? <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">{subscription.invoices.map((invoice) => <li key={invoice.id} className="flex justify-between gap-3 py-2"><span>{invoice.number ?? "Draft/reference pending"} Â· <span className="capitalize">{invoice.status.replaceAll("_", " ")}</span></span><span className="text-right tabular-nums">{money(invoice.total.toString(), currency)}<span className="block text-xs text-zinc-500">Due {money(invoice.amountDue.toString(), currency)}</span></span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No native financial references.</p>}</div><div><h3 className="text-sm font-semibold">Provider invoices</h3>{subscription.billingInvoices.length ? <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">{subscription.billingInvoices.map((invoice) => <li key={invoice.id} className="flex justify-between gap-3 py-2"><span>{invoice.displayNumber ?? invoice.providerInvoiceNumber ?? "Provider invoice"} Â· <span className="capitalize">{invoice.status.replaceAll("_", " ")}</span></span><span className="tabular-nums">{money(invoice.amountXcd.toString(), invoice.provider === "stripe" ? "XCD" : currency)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No provider financial references.</p>}</div></div>
      </details>

      <section id="history" className="space-y-3">
        <h2 className="text-lg font-semibold">History & details</h2>
        <details className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Service price and hardware history</summary><div className="mt-5 space-y-3">{subscription.items.map((item) => <article id={`history-${item.id}`} key={item.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700"><h3 className="font-semibold">{item.label || "Tracking service"}</h3><div className="mt-3 grid gap-5 lg:grid-cols-2"><div><h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Price history</h4>{item.rates.length ? <ul className="mt-2 space-y-2 text-sm">{item.rates.map((rate) => <li key={rate.id} className="flex flex-col justify-between gap-1 rounded-lg bg-zinc-50 px-3 py-2 sm:flex-row dark:bg-zinc-950"><span className="font-medium tabular-nums">{money(rate.agreedAmountPerCycle.toString(), rate.currency)} / {cycleUnit(rate.billingIntervalMonths)} Â· <span className="capitalize">{rate.classification}</span></span><span className="text-zinc-500">{displayDate(rate.effectiveFrom)} to {displayDate(rate.effectiveUntil)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No price history.</p>}</div><div><h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hardware assignments</h4>{item.serviceAssignments.length ? <ul className="mt-2 space-y-2 text-sm">{item.serviceAssignments.map((assignment) => <li key={assignment.id} className="flex flex-col justify-between gap-1 sm:flex-row"><span>{assignment.device.label?.trim() || assignment.device.deviceModel.name} Â· <span className="capitalize text-zinc-500">{assignment.status.replaceAll("_", " ")}</span></span><span className="text-zinc-500">{displayDate(assignment.startDate)} to {displayDate(assignment.endDate)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No linked device history.</p>}</div></div></article>)}</div></details>

        <details className="rounded-xl border border-sky-200 bg-sky-50/50 p-5 dark:border-sky-900 dark:bg-sky-950/20"><summary className="cursor-pointer font-semibold">Provider relationship and operations Â· {canonicalProviderStatusLabel(subscription.providerStatus)}</summary><p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Local relationship and operation history only. This does not claim live Stripe state.</p><div className="mt-4 space-y-2">{subscription.providerLinks.length ? subscription.providerLinks.map((link) => <div key={link.id} className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-900"><div className="flex flex-col justify-between gap-1 sm:flex-row"><span className="font-medium">{String(link.provider).toUpperCase()} Â· {link.externalSubscriptionId}</span><span className="capitalize text-zinc-500">{link.providerStatus || "status not recorded"}{link.endedAt ? " Â· ended" : " Â· open"}</span></div>{link.lastError ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{link.lastError}</p> : null}</div>) : <p className="text-sm text-zinc-500">No provider relationship is recorded.</p>}{subscription.billingOperations.map((operation) => <div key={operation.id} className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-900"><div className="flex justify-between gap-3"><span className="font-medium capitalize">{String(operation.type).replaceAll("_", " ")}</span><span className="capitalize text-zinc-500">{String(operation.status).replaceAll("_", " ")}</span></div>{operation.failureMessage ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{operation.failureMessage}</p> : null}</div>)}</div></details>

        {subscription.operationalActivation ? <details className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Activation record</summary><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-zinc-500">First billing</dt><dd className="mt-1 font-medium">{subscription.operationalActivation.initialBillingMode === "advance_invoice" ? "Initial invoice issued" : "Explicitly deferred"}</dd></div><div><dt className="text-zinc-500">First coverage</dt><dd className="mt-1 font-medium">{displayDate(subscription.operationalActivation.initialPeriodStart)} to {displayDate(subscription.operationalActivation.initialPeriodEnd)}</dd></div><div><dt className="text-zinc-500">Approved by</dt><dd className="mt-1 font-medium">{subscription.operationalActivation.approvedBy.name || subscription.operationalActivation.approvedBy.email}</dd></div><div><dt className="text-zinc-500">Activated</dt><dd className="mt-1 font-medium">{displayDate(subscription.operationalActivation.performedAt)}</dd></div></dl></details> : null}

        {subscription.controlMode === "shadow" && subscription.collectionMethod === "stripe_autocharge" ? <details open className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900 dark:bg-blue-950/20"><summary className="cursor-pointer font-semibold">Stripe adoption review</summary><div className="mt-4"><CanonicalStripeAdoptionForm subscriptionId={subscription.id} serviceCount={subscription.items.length} cycleTotal={subscription.summary?.recurringCycleTotal ?? null} nextBillingDate={displayDate(subscription.nextBillingDate)} /></div></details> : null}

        {subscription.billingIntervalMonths === 12 && subscription.controlMode !== "legacy" ? <details className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Annual addition and adjustment preview</summary><p className="mt-2 text-sm text-zinc-500">Preview only. This does not authorize collection or advance the recurring schedule.</p><form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium">Period start<input required type="date" name="periodStart" defaultValue={previewQuery.periodStart ?? iso(subscription.billingAnchorDate)} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Period end<input required type="date" name="periodEnd" defaultValue={previewQuery.periodEnd ?? nextBillingDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Activation date<input required type="date" name="activationDate" defaultValue={previewQuery.activationDate} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Annual amount<input name="annualAmount" inputMode="decimal" defaultValue={previewQuery.annualAmount ?? subscription.agreedAmountPerCycle?.toString()} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold sm:col-span-2 lg:col-span-4 dark:border-zinc-700">Calculate preview</button></form>{annualPreview ? <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100">Prorated preview: {money(annualPreview.proratedAmount.toString(), annualPreview.currency)} Â· effective {annualPreview.futureRecurringEffectiveDate}</p> : null}{annualPreviewError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{annualPreviewError}</p> : null}</details> : null}

        {(subscription.canonicalMigrationLedger?.sourceKind === "manual_schedule" || subscription.canonicalMigrationLedger?.sourceKind === "manual_invoice") ? <details className="rounded-xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20"><summary className="cursor-pointer font-semibold">Manual pilot authority transfer</summary>{subscription.manualPilotReview ? <><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-zinc-500">Billing source</dt><dd className="mt-1 font-medium capitalize">{subscription.manualPilotReview.proposal.sourceKind.replaceAll("_", " ")}</dd></div><div><dt className="text-zinc-500">Cutover period</dt><dd className="mt-1 font-medium">{subscription.manualPilotReview.proposal.cutoverPeriodStart}</dd></div><div><dt className="text-zinc-500">Approved recurring total</dt><dd className="mt-1 font-medium">{money(subscription.manualPilotReview.proposal.recurringAmount, subscription.manualPilotReview.proposal.currency)}</dd></div><div><dt className="text-zinc-500">Historical outstanding</dt><dd className="mt-1 font-medium">{money(subscription.manualPilotReview.proposal.outstandingBalance, subscription.manualPilotReview.proposal.currency)}</dd></div></dl>{localPilotActivationAvailable ? <form action={activateManualPilotLocallyAction} className="mt-5 space-y-3 rounded-lg border border-violet-200 bg-white p-4 dark:border-violet-900 dark:bg-zinc-900"><input type="hidden" name="subscriptionId" value={subscription.id} /><label className="block text-sm font-medium">Synthetic approval reason<textarea required name="approvalReason" rows={3} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" /></label><div className="grid gap-2 text-sm sm:grid-cols-2">{[["confirmCustomer", "Customer identity confirmed"], ["confirmTerms", "Commercial terms confirmed"], ["confirmBalances", "Historical balances reconciled"], ["confirmLegacyStop", "Exact legacy schedule will stop"], ["confirmCanonicalStart", "Subscription schedule will start"], ["confirmRecovery", "Recovery procedure reviewed"]].map(([name, label]) => <label key={name} className="flex items-start gap-2"><input required type="checkbox" name={name} value="yes" className="mt-1" /><span>{label}</span></label>)}</div><button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white">Activate synthetic manual pilot</button></form> : <p className="mt-4 text-xs text-zinc-500">Production cutover controls remain unavailable without the separately approved pilot configuration.</p>}</> : <p className="mt-4 text-sm text-zinc-500">{subscription.manualPilotReviewError ?? "Pilot readiness is unavailable."}</p>}</details> : null}
      </section>
        </div>
      </details>
    </div>
  );
}
