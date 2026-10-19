import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatExpenseAmount } from "@/lib/domain/expenses";
import {
  canonicalIntervalLabel,
  canonicalSubscriptionUiVisible,
  filterCanonicalSubscriptionAdminRows,
} from "@/lib/domain/canonical-subscription-admin";
import {
  canonicalSubscriptionUiStaffViewer,
  listCanonicalSubscriptionAdminRows,
  type CanonicalSubscriptionAdminRow,
} from "@/lib/services/canonical-subscription-admin-service";

type Props = {
  searchParams: Promise<{
    q?: string;
    view?: string;
    collection?: string;
    lifecycle?: string;
    attention?: string;
  }>;
};

function money(value: string | null, currency: string) {
  return value == null ? "-" : formatExpenseAmount(Number(value), currency);
}

function date(value: Date | null) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "-";
}

function collectionLabel(value: string | null) {
  return value === "stripe_autocharge" ? "Card billing" : "Manual invoice";
}

function subscriptionStatus(row: CanonicalSubscriptionAdminRow) {
  if (row.access === "editable_draft") return "Needs setup";
  if (row.access === "migrated_shadow_read_only" || row.access === "shadow_read_only") {
    return row.attentionRequired ? "Needs attention" : "Billing review";
  }
  if (row.lifecycleStatus === "active") return "Active";
  return row.lifecycleStatus.replaceAll("_", " ");
}

function statusClass(row: CanonicalSubscriptionAdminRow) {
  if (row.attentionRequired || row.access === "editable_draft") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (row.lifecycleStatus === "active") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function collectionClass(value: string | null) {
  return value === "stripe_autocharge"
    ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function serviceSummary(row: CanonicalSubscriptionAdminRow) {
  const services = `${row.itemCount} service${row.itemCount === 1 ? "" : "s"}`;
  return row.itemCount > 0 ? `${canonicalIntervalLabel(row.billingIntervalMonths)} · ${services}` : "Billing not configured";
}

function filterHref(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return `/admin/subscriptions/canonical${query ? `?${query}` : ""}`;
}

export default async function SubscriptionsPage({ searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");

  const { q = "", view = "current", collection = "", lifecycle = "", attention = "" } = await searchParams;
  const allRows = await listCanonicalSubscriptionAdminRows();
  const subscriptionRows = allRows.filter((row) => row.controlMode !== "legacy");
  const filteredRows = filterCanonicalSubscriptionAdminRows(subscriptionRows, {
    query: q,
    view,
    collectionMethod: collection,
    lifecycleStatus: lifecycle,
  });
  const rows = attention === "true" ? filteredRows.filter((row) => row.attentionRequired) : filteredRows;
  const currentRows = subscriptionRows.filter((row) => !row.historical);
  const activeRows = currentRows.filter((row) => row.lifecycleStatus === "active");
  const monthlyValue = currentRows.reduce((sum, row) => sum + Number(row.normalizedMrr ?? 0), 0);
  const attentionCount = currentRows.filter((row) => row.attentionRequired).length;
  const cardCount = currentRows.filter((row) => row.collectionMethod === "stripe_autocharge").length;
  const manualCount = currentRows.filter((row) => row.collectionMethod === "manual_invoice").length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500">Billing / Subscriptions</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">One operational view for customer agreements, services, renewals, and collection.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/subscriptions/attention" className="rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:text-amber-300">Attention queue</Link>
          <Link href="/admin/subscriptions/canonical/new" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Add subscription</Link>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Estimated MRR</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatExpenseAmount(monthlyValue, "XCD")}</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Active recurring value</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Active subscriptions</p><p className="mt-2 text-2xl font-semibold tabular-nums">{activeRows.length}</p><p className="mt-1 text-xs text-zinc-500">{cardCount} card · {manualCount} manual</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Needs attention</p><p className="mt-2 text-2xl font-semibold tabular-nums">{attentionCount}</p><p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Collection or renewal follow-up</p></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">Collection mix</p><p className="mt-2 text-2xl font-semibold tabular-nums">{cardCount} card / {manualCount} manual</p><p className="mt-1 text-xs text-blue-700 dark:text-blue-300">Card billing and invoice tracks</p></div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <form className="flex flex-col gap-2 sm:flex-row">
          <input name="q" defaultValue={q} placeholder="Search customer, subscription or reference" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
          <button className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Search</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={filterHref({ q, view: "current" })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${view === "current" && !collection && !lifecycle && !attention ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>All</Link>
          <Link href={filterHref({ q, view: "current", lifecycle: "active" })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${lifecycle === "active" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>Active</Link>
          <Link href={filterHref({ q, view: "current", attention: "true" })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${attention ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>Attention</Link>
          <Link href={filterHref({ q, view: "drafts" })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${view === "drafts" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>Needs setup</Link>
          <Link href={filterHref({ q, view: "current", collection: "stripe_autocharge" })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${collection === "stripe_autocharge" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>Card billing</Link>
          <Link href={filterHref({ q, view: "current", collection: "manual_invoice" })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${collection === "manual_invoice" ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>Manual invoice</Link>
          <Link href={filterHref({ q, view: "history" })} className={`rounded-full px-3 py-1.5 text-xs font-medium ${view === "history" ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}>Ended</Link>
        </div>
      </section>

      {rows.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900"><h2 className="font-semibold">No subscriptions in this view</h2><p className="mt-1 text-sm text-zinc-500">Adjust the search or filters, or add a customer subscription.</p></div> : <>
        <div className="grid gap-3 md:hidden">
          {rows.map((row) => <article key={row.id} className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${row.attentionRequired ? "ring-1 ring-amber-300 dark:ring-amber-800" : ""}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-emerald-700 dark:text-emerald-400">{row.customer}</p><p className="mt-0.5 text-sm text-zinc-500">{serviceSummary(row)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row)}`}>{subscriptionStatus(row)}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zinc-500">Collection</dt><dd className="mt-1"><span className={`rounded-full px-2 py-1 text-xs font-medium ${collectionClass(row.collectionMethod)}`}>{collectionLabel(row.collectionMethod)}</span></dd></div><div><dt className="text-xs text-zinc-500">MRR</dt><dd className="mt-1 font-medium tabular-nums">{money(row.normalizedMrr, row.currency)}</dd></div><div className="col-span-2"><dt className="text-xs text-zinc-500">Next renewal</dt><dd className="mt-1 font-medium">{date(row.nextBillingDate)}</dd></div></dl><Link href={`/admin/subscriptions/canonical/${row.id}`} className="mt-4 block text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open subscription</Link></article>)}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900"><table className="min-w-[940px] w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Collection</th><th className="px-4 py-3">Plan / services</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Next renewal</th><th className="px-4 py-3 text-right">MRR</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{rows.map((row) => <tr key={row.id} className={row.attentionRequired ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}><td className="px-4 py-3"><p className="font-medium text-emerald-700 dark:text-emerald-400">{row.customer}</p><p className="text-xs text-zinc-500">{row.name}{row.reference ? ` · ${row.reference}` : ""}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${collectionClass(row.collectionMethod)}`}>{collectionLabel(row.collectionMethod)}</span></td><td className="px-4 py-3">{serviceSummary(row)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(row)}`}>{subscriptionStatus(row)}</span></td><td className="px-4 py-3">{date(row.nextBillingDate)}</td><td className="px-4 py-3 text-right tabular-nums">{money(row.normalizedMrr, row.currency)}</td><td className="px-4 py-3 text-right"><Link href={`/admin/subscriptions/canonical/${row.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td></tr>)}</tbody></table></div>
      </>}

      <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer font-semibold">Billing records and transition history</summary><p className="mt-2 max-w-3xl text-zinc-600 dark:text-zinc-400">Historical arrangements and migration records remain available for audit and recovery. They are kept separate from daily subscription management.</p><div className="mt-3 flex flex-wrap gap-3"><Link href="/admin/subscriptions/legacy" className="font-semibold text-emerald-700 underline dark:text-emerald-400">Open legacy records</Link><Link href="/admin/subscriptions/canonical/migrations" className="font-semibold text-emerald-700 underline dark:text-emerald-400">Open migration history</Link></div></details>
      <p className="text-xs text-zinc-500">Card-billing details are shown for review only. This workspace never starts a charge or changes a provider subscription.</p>
    </div>
  );
}
