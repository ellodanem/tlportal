import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { CustomerCollectionSummary } from "@/components/admin/customer-collection-summary";
import { CustomerAssignmentServiceActions } from "@/components/admin/customer-assignment-service-actions";
import {
  canonicalIntervalLabel,
  canonicalSubscriptionDisplayName,
  canonicalSubscriptionUiVisible,
} from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";
import { loadCustomerCollectionSummary } from "@/lib/admin/load-customer-collection-summary";
import {
  canonicalSubscriptionUiStaffViewer,
  getCanonicalSubscriptionAdminDetail,
} from "@/lib/services/canonical-subscription-admin-service";
import { reconcileLatestStripeInvoiceForCustomer } from "@/lib/services/stripe-invoice-backfill-service";

type Props = { params: Promise<{ id: string }> };
type SubscriptionDetail = NonNullable<Awaited<ReturnType<typeof getCanonicalSubscriptionAdminDetail>>>;
type SubscriptionItem = SubscriptionDetail["items"][number];

function money(value: string | number | null | undefined, currency: string) {
  return value == null ? "-" : formatExpenseAmount(Number(value), currency);
}

function date(value: Date | null | undefined) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "Not scheduled";
}

function customerName(customer: { company: string | null; firstName: string | null; lastName: string | null }) {
  return customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Customer";
}

function collectionLabel(value: string | null) {
  return value === "stripe_autocharge" ? "Card billing" : "Manual invoice";
}

function currentRate(item: SubscriptionItem, today: Date) {
  return item.rates.filter((rate) => rate.effectiveFrom <= today && (!rate.effectiveUntil || rate.effectiveUntil > today)).at(-1)
    ?? item.rates.at(-1)
    ?? null;
}

function currentAssignment(item: SubscriptionItem) {
  return item.serviceAssignments.find((assignment) => assignment.endDate == null && assignment.status !== "cancelled")
    ?? item.serviceAssignments.at(-1)
    ?? null;
}

function subscriptionStatusClass(subscription: SubscriptionDetail) {
  if (subscription.summary?.attentionRequired) return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (subscription.lifecycleStatus === "active") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (subscription.lifecycleStatus === "paused") return "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100";
  return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
}

function serviceStatusClass(status: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (status === "paused") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

export default async function CustomerSubscriptionsPage({ params }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const { id } = await params;
  await reconcileLatestStripeInvoiceForCustomer(id);
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      billingMode: true,
      customerSubscriptions: {
        where: { controlMode: { not: "legacy" } },
        orderBy: [{ nextBillingDate: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      },
    },
  });
  if (!customer) notFound();

  const [loadedSubscriptions, legacyAssignments, pausedAssignments, collectionSummary] = await Promise.all([
    Promise.all(customer.customerSubscriptions.map((subscription) => getCanonicalSubscriptionAdminDetail(subscription.id))),
    prisma.serviceAssignment.findMany({
      where: {
        customerId: customer.id,
        subscriptionItemId: null,
        endDate: null,
        status: { in: ["active", "due_soon", "overdue"] },
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        startDate: true,
        intervalMonths: true,
        device: {
          select: {
            id: true,
            label: true,
            imei: true,
            deviceModel: { select: { name: true } },
            simCard: { select: { iccid: true, label: true } },
          },
        },
      },
    }),
    prisma.serviceAssignment.findMany({
      where: {
        customerId: customer.id,
        subscriptionItemId: null,
        status: "suspended",
        endDate: null,
      },
      orderBy: [{ pausedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        pausedAt: true,
        pauseReason: true,
        device: { select: { id: true, label: true, status: true, deviceModel: { select: { name: true } } } },
      },
    }),
    loadCustomerCollectionSummary(customer.id),
  ]);
  const subscriptions = loadedSubscriptions.filter(
    (subscription): subscription is SubscriptionDetail => subscription != null,
  );
  const currentSubscriptions = subscriptions.filter(
    (subscription) => !["ended", "canceled"].includes(subscription.lifecycleStatus ?? ""),
  );
  const activeServices = currentSubscriptions.reduce(
    (sum, subscription) => sum + subscription.items.filter((item) => !["ended", "canceled"].includes(item.status)).length,
    0,
  );
  const monthlyValue = currentSubscriptions.reduce(
    (sum, subscription) => sum + Number(subscription.normalizedMrr ?? 0),
    0,
  );
  const nextRenewal = currentSubscriptions
    .map((subscription) => subscription.nextBillingDate)
    .filter((value): value is Date => value != null)
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const attentionCount = currentSubscriptions.filter((subscription) => subscription.summary?.attentionRequired).length;
  const today = new Date();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-2xl bg-zinc-50/70 p-1 sm:p-2 dark:bg-zinc-950/40">
      <div className="flex flex-col gap-5 px-3 pt-3 sm:flex-row sm:items-end sm:justify-between sm:px-4 sm:pt-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-zinc-500">Customer <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">/</span> {customerName(customer)}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Subscriptions</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">Commercial agreements, billable GPS services, prices, equipment assignments, and renewals.</p>
        </div>
        <Link href={`/admin/subscriptions/canonical/new?customerId=${customer.id}`} className="inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950">
          <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
          Add subscription
        </Link>
      </div>

      <CustomerSubnav customerId={customer.id} active="subscriptions" />

      {collectionSummary ? <CustomerCollectionSummary customerId={customer.id} summary={collectionSummary} /> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-h-35 rounded-2xl border border-blue-200/90 bg-blue-50/80 p-5 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/25"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"><svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 21h-15a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 4.5 3h9L21 10.5v9a1.5 1.5 0 0 1-1.5 1.5Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 3v7.5h8M8 15h8M8 18h5" /></svg></span><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">Current agreements</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-zinc-950 dark:text-zinc-50">{currentSubscriptions.length}</p><p className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-300">Independent billing arrangements</p></div></div></div>
        <div className="min-h-35 rounded-2xl border border-emerald-200/90 bg-emerald-50/80 p-5 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/25"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"><svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg></span><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Billable services</p><p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-zinc-950 dark:text-zinc-50">{activeServices}</p><p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-300">Active GPS service identities</p></div></div></div>
        <div className="min-h-35 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"><svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="7" ry="3" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></svg></span><div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Monthly value</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-zinc-950 dark:text-zinc-50">{formatExpenseAmount(monthlyValue, "XCD")}</p><p className="mt-1 text-xs leading-5 text-zinc-500">Normalized recurring value</p></div></div></div>
        <div className={`min-h-35 rounded-2xl border p-5 shadow-sm ${attentionCount ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/25" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}><div className="flex items-start gap-3"><span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${attentionCount ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}><svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M7 3v4M17 3v4M3 10h18" /></svg></span><div><p className={`text-xs font-semibold uppercase tracking-wide ${attentionCount ? "text-amber-800 dark:text-amber-300" : "text-zinc-500"}`}>Next renewal</p><p className="mt-2 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{date(nextRenewal)}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{attentionCount ? `${attentionCount} agreement${attentionCount === 1 ? "" : "s"} need attention` : "Agreement schedule · see collection status above"}</p></div></div></div>
      </section>

      {legacyAssignments.length ? <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm sm:p-6 dark:border-blue-900/60 dark:bg-blue-950/20">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Legacy installation assignments</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">These devices are assigned to the customer outside the subscription workflow. They remain visible while installation is pending, but do not create a billable GPS service, invoice, or subscription.</p>
          </div>
          <Link href={`/admin/subscriptions/${customer.id}/renewals`} className="w-fit shrink-0 text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-400">Legacy renewal tools</Link>
        </div>
        <div className="mt-5 space-y-3">{legacyAssignments.map((assignment) => {
          const deviceLabel = assignment.device.label?.trim() || assignment.device.deviceModel.name;
          const simLabel = assignment.device.simCard?.label?.trim() || assignment.device.simCard?.iccid || "No SIM linked";
          return <div key={assignment.id} className="grid gap-4 rounded-xl border border-blue-200/80 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.9fr)_minmax(0,.8fr)_auto] lg:items-center lg:gap-0 dark:border-blue-900/60 dark:bg-zinc-900">
            <div className="min-w-0 lg:pr-5"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-zinc-950 dark:text-zinc-50">{deviceLabel}</p><span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200">Legacy assignment</span></div><p className="mt-1 truncate text-xs text-zinc-500" title={assignment.device.imei}>{assignment.device.deviceModel.name} / {assignment.device.imei}</p></div>
            <div className="border-t border-zinc-100 pt-4 sm:border-t-0 sm:border-r sm:pr-5 lg:border-l lg:border-r-0 lg:pl-5 lg:pt-0 dark:border-zinc-800"><p className="text-xs font-medium text-zinc-500">Installation / service start</p><p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{date(assignment.startDate)}</p><p className="mt-1 text-xs text-zinc-500">{assignment.startDate ? "Confirm completion at the scheduled visit" : "Date not recorded"}</p></div>
            <div className="border-t border-zinc-100 pt-4 sm:border-t-0 sm:pl-5 lg:border-l lg:pt-0 dark:border-zinc-800"><p className="text-xs font-medium text-zinc-500">Billing context</p><p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{assignment.intervalMonths ? canonicalIntervalLabel(assignment.intervalMonths) : "Term not set"}</p><p className="mt-1 truncate text-xs text-zinc-500" title={simLabel}>SIM / {simLabel}</p></div>
            <Link href={`/admin/devices/${assignment.device.id}/edit?tab=assignment`} className="w-fit border-t border-zinc-100 pt-4 text-sm font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-zinc-800 dark:text-emerald-400">View assignment</Link>
          </div>;
        })}</div>
      </section> : null}
      {subscriptions.length ? <div className="space-y-5">{subscriptions.map((subscription) => {
        const currency = subscription.currency ?? "XCD";
        const displayName = canonicalSubscriptionDisplayName(subscription.name, subscription.billingIntervalMonths);
        const openBalance = subscription.invoices.reduce((sum, invoice) => sum + Number(invoice.amountDue), 0);
        const providerConnected = subscription.collectionMethod === "stripe_autocharge"
          && subscription.providerLinks.some((link) => link.endedAt == null);
        const statusLabel = subscription.summary?.attentionRequired
          ? "Needs attention"
          : (subscription.lifecycleStatus ?? "Not classified").replaceAll("_", " ");
        const collectionHealth = subscription.summary?.collectionHealth === "not_started"
          ? "No invoice history"
          : subscription.summary?.collectionHealth?.replaceAll("_", " ") ?? "No billing history";
        return <article key={subscription.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-900 ${subscription.summary?.attentionRequired ? "border-amber-300 dark:border-amber-800" : "border-zinc-200 dark:border-zinc-800"}`}>
          <header className="border-b border-zinc-100 p-5 sm:p-6 dark:border-zinc-800"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{displayName}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${subscriptionStatusClass(subscription)}`}>{statusLabel}</span></div><p className="mt-2 max-w-2xl truncate text-sm text-zinc-500" title={subscription.reference ?? undefined}>{collectionLabel(subscription.collectionMethod)} · {canonicalIntervalLabel(subscription.billingIntervalMonths)}{subscription.reference ? ` · ${subscription.reference}` : ""}</p></div><div className="flex flex-wrap gap-2"><Link href={`/admin/subscriptions/canonical/${subscription.id}`} className="rounded-xl bg-emerald-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900">Manage subscription</Link><Link href={`/admin/customers/${customer.id}/billing`} className="rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:ring-offset-zinc-900">Billing history</Link></div></div>
            <dl className="mt-6 grid overflow-hidden rounded-xl border border-zinc-100 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 dark:border-zinc-800"><div className="border-b border-zinc-100 p-3.5 sm:border-r lg:border-b xl:border-b-0 dark:border-zinc-800"><dt className="text-xs font-medium text-zinc-500">Services</dt><dd className="mt-1.5 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{subscription.items.length}</dd></div><div className="border-b border-zinc-100 p-3.5 lg:border-r xl:border-b-0 dark:border-zinc-800"><dt className="text-xs font-medium text-zinc-500">Cycle total</dt><dd className="mt-1.5 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{money(subscription.summary?.recurringCycleTotal, currency)}</dd></div><div className="border-b border-zinc-100 p-3.5 sm:border-r xl:border-b-0 dark:border-zinc-800"><dt className="text-xs font-medium text-zinc-500">Monthly value</dt><dd className="mt-1.5 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{money(subscription.normalizedMrr, currency)}</dd></div><div className="border-b border-zinc-100 p-3.5 lg:border-r xl:border-b-0 dark:border-zinc-800"><dt className="text-xs font-medium text-zinc-500">Next renewal</dt><dd className="mt-1.5 font-semibold text-zinc-950 dark:text-zinc-50">{date(subscription.nextBillingDate)}</dd></div><div className="border-b border-zinc-100 p-3.5 sm:border-r sm:border-b-0 xl:border-b-0 dark:border-zinc-800"><dt className="text-xs font-medium text-zinc-500">Invoice collection</dt><dd className="mt-1.5 font-semibold capitalize text-zinc-950 dark:text-zinc-50">{collectionHealth}</dd></div><div className="p-3.5"><dt className="text-xs font-medium text-zinc-500">Recorded balance</dt><dd className={`mt-1.5 font-semibold tabular-nums ${openBalance > 0 ? "text-amber-800 dark:text-amber-300" : "text-zinc-950 dark:text-zinc-50"}`}>{formatExpenseAmount(openBalance, currency)}</dd></div></dl>
            {subscription.collectionMethod === "stripe_autocharge" ? <p className={`mt-4 text-xs ${providerConnected ? "text-blue-700 dark:text-blue-300" : "text-amber-800 dark:text-amber-300"}`}>{providerConnected ? "Card billing relationship recorded" : "Card billing relationship needs review"}</p> : <p className="mt-4 text-xs text-zinc-500">Manual collection · invoices and payments remain in customer Billing</p>}
          </header>

          <section className="p-5 sm:p-6"><h3 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Billable GPS services</h3><p className="mt-1 text-sm text-zinc-500">Each service keeps its own price and device-assignment history.</p>
            {subscription.items.length ? <div className="mt-5 space-y-3">{subscription.items.map((item) => {
              const rate = currentRate(item, today);
              const assignment = currentAssignment(item);
              const deviceLabel = assignment?.device.label?.trim() || assignment?.device.deviceModel.name || "No device assigned";
              const canManage = subscription.controlMode === "canonical" && ["editable_draft", "canonical_operational"].includes(subscription.access) && !["ended", "canceled"].includes(item.status);
              const canPause = canManage && assignment != null && assignment.endDate == null && assignment.status !== "cancelled";
              const serviceLabel = item.label?.trim() || "GPS tracking service";
              return <div key={item.id} className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,.9fr)_auto_auto] lg:items-center lg:gap-0 dark:border-zinc-700 dark:bg-zinc-900"><div className="min-w-0 lg:pr-5"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-zinc-950 dark:text-zinc-50">{serviceLabel}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${serviceStatusClass(item.status)}`}>{item.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-zinc-500">Service since {date(item.serviceActivatedDate ?? item.billingEffectiveFrom)}</p></div><div className="border-t border-zinc-100 pt-4 sm:border-t-0 sm:border-r sm:pr-5 lg:border-l lg:border-r-0 lg:pl-5 lg:pt-0 dark:border-zinc-800"><p className="text-xs font-medium text-zinc-500">Device / SIM assignment</p><p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={deviceLabel}>{deviceLabel}</p>{assignment ? <><Link href={`/admin/devices/${assignment.device.id}/edit?tab=assignment`} className="mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-400">View assignment</Link>{assignment.status === "suspended" ? <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-300">Assignment paused</p> : null}</> : null}</div><div className="border-t border-zinc-100 pt-4 sm:border-t-0 sm:pl-5 lg:border-l lg:pt-0 dark:border-zinc-800"><p className="text-xs font-medium text-zinc-500">Current price</p><p className="mt-1 font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">{rate ? money(rate.agreedAmountPerCycle.toString(), rate.currency) : "Not set"}</p>{rate ? <p className="mt-1 text-xs capitalize text-zinc-500">{rate.classification} / {canonicalIntervalLabel(rate.billingIntervalMonths).toLowerCase()}</p> : null}</div>{canPause ? <div className="border-t border-zinc-100 pt-4 lg:border-l lg:border-t-0 lg:px-5 lg:pt-0 dark:border-zinc-800"><CustomerAssignmentServiceActions assignmentId={assignment.id} deviceId={assignment.device.id} billingMode={customer.billingMode} status={assignment.status} open layout="inline" /></div> : null}{canManage ? <Link href={`/admin/subscriptions/canonical/${subscription.id}#service-management`} className="w-fit rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30 dark:focus-visible:ring-offset-zinc-900">Manage</Link> : <Link href={`/admin/subscriptions/canonical/${subscription.id}#services`} className="w-fit rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30 dark:focus-visible:ring-offset-zinc-900">View</Link>}</div>;
            })}</div> : <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">No billable services have been added to this agreement.</div>}
          </section>
        </article>;
      })}</div> : <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900"><h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">No subscriptions have been set up</h2><p className="mt-1 text-sm text-zinc-500">Create the customer’s first agreement, then add each billable tracking service to it.</p><Link href={`/admin/subscriptions/canonical/new?customerId=${customer.id}`} className="mt-4 inline-flex rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900">Add subscription</Link></section>}

      {pausedAssignments.length ? <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm sm:p-6 dark:border-amber-900/60 dark:bg-amber-950/15">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Paused device assignments</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">These paused assignments are not linked to a current billable GPS service, but remain visible here so staff can review or resume them.</p>
        </div>
        <div className="mt-5 space-y-3">{pausedAssignments.map((assignment) => {
          const deviceLabel = assignment.device.label?.trim() || assignment.device.deviceModel.name;
          return <div key={assignment.id} className="grid gap-4 rounded-xl border border-amber-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.9fr)_minmax(0,.8fr)_auto] lg:items-center lg:gap-0 dark:border-amber-900/60 dark:bg-zinc-900">
            <div className="min-w-0 lg:pr-5"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-zinc-950 dark:text-zinc-50">{deviceLabel}</p><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Paused</span></div><p className="mt-1 text-xs text-zinc-500">Device assignment</p></div>
            <div className="border-t border-zinc-100 pt-4 sm:border-t-0 sm:border-r sm:pr-5 lg:border-l lg:border-r-0 lg:pl-5 lg:pt-0 dark:border-zinc-800"><p className="text-xs font-medium text-zinc-500">Device state</p><p className="mt-1 text-sm font-medium capitalize text-zinc-900 dark:text-zinc-100">{assignment.device.status.replaceAll("_", " ")}</p><Link href={`/admin/devices/${assignment.device.id}/edit?tab=assignment`} className="mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-400">View assignment</Link></div>
            <div className="border-t border-zinc-100 pt-4 sm:border-t-0 sm:pl-5 lg:border-l lg:pt-0 dark:border-zinc-800"><p className="text-xs font-medium text-zinc-500">Pause details</p><p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{date(assignment.pausedAt)}</p>{assignment.pauseReason ? <p className="mt-1 text-xs capitalize text-zinc-500">{assignment.pauseReason.replaceAll("_", " ")}</p> : null}</div>
            <div className="border-t border-zinc-100 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-zinc-800"><CustomerAssignmentServiceActions assignmentId={assignment.id} deviceId={assignment.device.id} billingMode={customer.billingMode} status={assignment.status} open /></div>
          </div>;
        })}</div>
      </section> : null}

      <details className="group rounded-2xl border border-zinc-200 bg-white text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><summary className="flex cursor-pointer list-none items-center gap-3 p-5 font-semibold text-zinc-950 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 dark:text-zinc-50"><svg aria-hidden="true" className="size-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" /></svg>Historical billing records</summary><div className="border-t border-zinc-100 px-5 pb-5 pt-4 dark:border-zinc-800"><p className="text-zinc-600 dark:text-zinc-400">Older arrangements remain preserved for audit and recovery. They do not control the subscriptions listed above.</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><Link href={`/admin/subscriptions/${customer.id}/renewals`} className="font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-400">Legacy renewal tools</Link><Link href={`/admin/subscriptions/legacy?customer=${customer.id}`} className="font-semibold text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-400">Historical records</Link></div></div></details>
    </div>
  );
}
