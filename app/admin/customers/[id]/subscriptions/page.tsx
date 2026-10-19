import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { canonicalIntervalLabel, canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";
import {
  canonicalSubscriptionUiStaffViewer,
  listCanonicalSubscriptionAdminRows,
} from "@/lib/services/canonical-subscription-admin-service";

type Props = { params: Promise<{ id: string }> };

function money(value: string | null, currency: string) {
  return value == null ? "—" : formatExpenseAmount(Number(value), currency);
}

function date(value: Date | null) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "Not scheduled";
}

function customerName(customer: { company: string | null; firstName: string | null; lastName: string | null }) {
  return customer.company?.trim() || [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Customer";
}

export default async function CustomerSubscriptionsPage({ params }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, company: true, firstName: true, lastName: true },
  });
  if (!customer) notFound();

  const subscriptions = (await listCanonicalSubscriptionAdminRows())
    .filter((row) => row.customerId === customer.id && row.controlMode !== "legacy")
    .sort((left, right) => Number(right.nextBillingDate ?? 0) - Number(left.nextBillingDate ?? 0));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-medium text-zinc-500">Customer / {customerName(customer)}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Subscriptions</h1><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Commercial agreements, GPS services, pricing, and future renewals for this customer.</p></div>
        <Link href={`/admin/subscriptions/canonical/new?customerId=${customer.id}`} className="w-fit rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Add subscription</Link>
      </div>

      <CustomerSubnav customerId={customer.id} active="subscriptions" />

      {subscriptions.length ? <div className="grid gap-4 lg:grid-cols-2">{subscriptions.map((subscription) => <article key={subscription.id} className={`rounded-xl border bg-white p-5 dark:bg-zinc-900 ${subscription.attentionRequired ? "border-amber-300 dark:border-amber-800" : "border-zinc-200 dark:border-zinc-800"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold">{subscription.name}</h2><p className="mt-1 text-sm text-zinc-500">{subscription.collectionMethod === "stripe_autocharge" ? "Card billing" : "Manual invoice"} · {canonicalIntervalLabel(subscription.billingIntervalMonths)}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${subscription.attentionRequired ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : subscription.lifecycleStatus === "active" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>{subscription.attentionRequired ? "Needs review" : subscription.lifecycleStatus.replaceAll("_", " ")}</span></div><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-zinc-500">Services</dt><dd className="mt-1 font-medium">{subscription.itemCount}</dd></div><div><dt className="text-zinc-500">Cycle total</dt><dd className="mt-1 font-medium tabular-nums">{money(subscription.recurringCycleTotal, subscription.currency)}</dd></div><div><dt className="text-zinc-500">Monthly value</dt><dd className="mt-1 font-medium tabular-nums">{money(subscription.normalizedMrr, subscription.currency)}</dd></div><div><dt className="text-zinc-500">Next renewal</dt><dd className="mt-1 font-medium">{date(subscription.nextBillingDate)}</dd></div></dl>{subscription.attentionRequired ? <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">{subscription.collectionMethod === "stripe_autocharge" ? "Card billing needs review before any provider change." : "Collection needs review."}</p> : null}<Link href={`/admin/subscriptions/canonical/${subscription.id}`} className="mt-5 inline-block font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open subscription</Link></article>)}</div> : <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900"><h2 className="font-semibold">No subscriptions have been set up</h2><p className="mt-1 text-sm text-zinc-500">Create the customer’s first agreement, then add each billable tracking service to it.</p></section>}

      <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Historical billing records</summary><p className="mt-2 text-zinc-600 dark:text-zinc-400">Older arrangements remain preserved in the billing archive and do not change the subscriptions listed above.</p><Link href={`/admin/subscriptions/legacy?customer=${customer.id}`} className="mt-3 inline-block font-semibold text-emerald-700 underline dark:text-emerald-400">Open historical records</Link></details>
    </div>
  );
}
