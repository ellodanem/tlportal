import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CustomerSubnav } from "@/components/admin/customer-subnav";
import {
  canonicalIntervalLabel,
  canonicalSubscriptionDisplayName,
  canonicalSubscriptionUiVisible,
} from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";
import {
  canonicalSubscriptionUiStaffViewer,
  getCanonicalSubscriptionAdminDetail,
} from "@/lib/services/canonical-subscription-admin-service";

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
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      customerSubscriptions: {
        where: { controlMode: { not: "legacy" } },
        orderBy: [{ nextBillingDate: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      },
    },
  });
  if (!customer) notFound();

  const loadedSubscriptions = await Promise.all(
    customer.customerSubscriptions.map((subscription) => getCanonicalSubscriptionAdminDetail(subscription.id)),
  );
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-medium text-zinc-500">Customer / {customerName(customer)}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Subscriptions</h1><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Commercial agreements, billable GPS services, prices, equipment assignments, and renewals.</p></div>
        <Link href={`/admin/subscriptions/canonical/new?customerId=${customer.id}`} className="w-fit rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Add subscription</Link>
      </div>

      <CustomerSubnav customerId={customer.id} active="subscriptions" />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">Current agreements</p><p className="mt-2 text-2xl font-semibold tabular-nums">{currentSubscriptions.length}</p><p className="mt-1 text-xs text-blue-700 dark:text-blue-300">Independent billing arrangements</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Billable services</p><p className="mt-2 text-2xl font-semibold tabular-nums">{activeServices}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Active GPS service identities</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Monthly value</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatExpenseAmount(monthlyValue, "XCD")}</p><p className="mt-1 text-xs text-zinc-500">Normalized recurring value</p></div>
        <div className={`rounded-xl border p-4 ${attentionCount ? "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/25" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"}`}><p className={`text-xs font-semibold uppercase tracking-wide ${attentionCount ? "text-amber-800 dark:text-amber-300" : "text-zinc-500"}`}>Next renewal</p><p className="mt-2 text-xl font-semibold">{date(nextRenewal)}</p><p className="mt-1 text-xs text-zinc-500">{attentionCount ? `${attentionCount} agreement${attentionCount === 1 ? "" : "s"} need attention` : "No collection issues detected"}</p></div>
      </section>

      {subscriptions.length ? <div className="space-y-5">{subscriptions.map((subscription) => {
        const currency = subscription.currency ?? "XCD";
        const displayName = canonicalSubscriptionDisplayName(subscription.name, subscription.billingIntervalMonths);
        const openBalance = subscription.invoices.reduce((sum, invoice) => sum + Number(invoice.amountDue), 0);
        const providerConnected = subscription.collectionMethod === "stripe_autocharge"
          && subscription.providerLinks.some((link) => link.endedAt == null);
        const statusLabel = subscription.summary?.attentionRequired
          ? "Needs attention"
          : (subscription.lifecycleStatus ?? "Not classified").replaceAll("_", " ");
        const collectionHealth = subscription.summary?.collectionHealth?.replaceAll("_", " ") ?? "No billing history";
        return <article key={subscription.id} className={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 ${subscription.summary?.attentionRequired ? "border-amber-300 dark:border-amber-800" : "border-zinc-200 dark:border-zinc-800"}`}>
          <header className="border-b border-zinc-100 p-4 sm:p-5 dark:border-zinc-800"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{displayName}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${subscriptionStatusClass(subscription)}`}>{statusLabel}</span></div><p className="mt-1 text-sm text-zinc-500">{collectionLabel(subscription.collectionMethod)} · {canonicalIntervalLabel(subscription.billingIntervalMonths)}{subscription.reference ? ` · ${subscription.reference}` : ""}</p></div><div className="flex flex-wrap gap-2"><Link href={`/admin/subscriptions/canonical/${subscription.id}`} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Manage subscription</Link><Link href={`/admin/customers/${customer.id}/billing`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold dark:border-zinc-700">Billing history</Link></div></div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-3 xl:grid-cols-6"><div><dt className="text-xs text-zinc-500">Services</dt><dd className="mt-1 font-semibold">{subscription.items.length}</dd></div><div><dt className="text-xs text-zinc-500">Cycle total</dt><dd className="mt-1 font-semibold tabular-nums">{money(subscription.summary?.recurringCycleTotal, currency)}</dd></div><div><dt className="text-xs text-zinc-500">Monthly value</dt><dd className="mt-1 font-semibold tabular-nums">{money(subscription.normalizedMrr, currency)}</dd></div><div><dt className="text-xs text-zinc-500">Next renewal</dt><dd className="mt-1 font-semibold">{date(subscription.nextBillingDate)}</dd></div><div><dt className="text-xs text-zinc-500">Collection health</dt><dd className="mt-1 font-semibold capitalize">{collectionHealth}</dd></div><div><dt className="text-xs text-zinc-500">Open balance</dt><dd className={`mt-1 font-semibold tabular-nums ${openBalance > 0 ? "text-amber-800 dark:text-amber-300" : ""}`}>{formatExpenseAmount(openBalance, currency)}</dd></div></dl>
            {subscription.collectionMethod === "stripe_autocharge" ? <p className={`mt-4 text-xs ${providerConnected ? "text-blue-700 dark:text-blue-300" : "text-amber-800 dark:text-amber-300"}`}>{providerConnected ? "Card billing relationship recorded" : "Card billing relationship needs review"}</p> : <p className="mt-4 text-xs text-zinc-500">Manual collection · invoices and payments remain in customer Billing</p>}
          </header>

          <section className="p-4 sm:p-5"><h3 className="font-semibold">Billable GPS services</h3><p className="mt-1 text-sm text-zinc-500">Each service keeps its own price and device-assignment history.</p>
            {subscription.items.length ? <div className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">{subscription.items.map((item) => {
              const rate = currentRate(item, today);
              const assignment = currentAssignment(item);
              const deviceLabel = assignment?.device.label?.trim() || assignment?.device.deviceModel.name || "No device assigned";
              return <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,.8fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{item.label?.trim() || "GPS tracking service"}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${serviceStatusClass(item.status)}`}>{item.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-zinc-500">Service since {date(item.serviceActivatedDate ?? item.billingEffectiveFrom)}</p></div><div><p className="text-xs text-zinc-500">Device / SIM assignment</p><p className="mt-1 text-sm font-medium">{deviceLabel}</p>{assignment ? <Link href={`/admin/devices/${assignment.device.id}/edit?tab=assignment`} className="mt-1 inline-block text-xs text-emerald-700 hover:underline dark:text-emerald-400">View assignment</Link> : null}</div><div><p className="text-xs text-zinc-500">Current price</p><p className="mt-1 font-semibold tabular-nums">{rate ? money(rate.agreedAmountPerCycle.toString(), rate.currency) : "Not set"}</p>{rate ? <p className="mt-1 text-xs capitalize text-zinc-500">{rate.classification} / {canonicalIntervalLabel(rate.billingIntervalMonths).toLowerCase()}</p> : null}</div><Link href={`/admin/subscriptions/canonical/${subscription.id}#services`} className="w-fit text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Manage</Link></div>;
            })}</div> : <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">No billable services have been added to this agreement.</div>}
          </section>
        </article>;
      })}</div> : <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900"><h2 className="font-semibold">No subscriptions have been set up</h2><p className="mt-1 text-sm text-zinc-500">Create the customer’s first agreement, then add each billable tracking service to it.</p><Link href={`/admin/subscriptions/canonical/new?customerId=${customer.id}`} className="mt-4 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Add subscription</Link></section>}

      <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Historical billing records</summary><p className="mt-2 text-zinc-600 dark:text-zinc-400">Older arrangements remain preserved for audit and recovery. They do not control the subscriptions listed above.</p><div className="mt-3 flex flex-wrap gap-3"><Link href={`/admin/subscriptions/${customer.id}/renewals`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Legacy renewal tools</Link><Link href={`/admin/subscriptions/legacy?customer=${customer.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Historical records</Link></div></details>
    </div>
  );
}
