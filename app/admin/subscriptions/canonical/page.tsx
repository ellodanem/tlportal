import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatExpenseAmount } from "@/lib/domain/expenses";
import {
  canonicalControlLabel,
  canonicalIntervalLabel,
  canonicalProviderStatusLabel,
  canonicalSubscriptionUiEnabled,
  canonicalSubscriptionUiVisible,
  filterCanonicalSubscriptionAdminRows,
} from "@/lib/domain/canonical-subscription-admin";
import {
  listCanonicalSubscriptionAdminRows,
  canonicalSubscriptionUiStaffViewer,
  type CanonicalSubscriptionAdminRow,
} from "@/lib/services/canonical-subscription-admin-service";

type Props = {
  searchParams: Promise<{
    q?: string;
    view?: string;
    collection?: string;
    lifecycle?: string;
    control?: string;
    provider?: string;
  }>;
};

function money(value: string | null, currency: string) {
  return value == null ? "-" : formatExpenseAmount(Number(value), currency);
}

function date(value: Date | null) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "-";
}

function collectionLabel(value: string | null) {
  return value === "stripe_autocharge"
    ? "Stripe autocharge"
    : value === "manual_invoice"
      ? "Manual invoice"
      : "Not classified";
}

function badgeClass(row: CanonicalSubscriptionAdminRow) {
  if (row.access === "editable_draft") return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  if (row.access === "migrated_shadow_read_only") return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
  if (row.controlMode === "canonical") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function destination(row: CanonicalSubscriptionAdminRow) {
  return row.controlMode === "legacy"
    ? `/admin/subscriptions/${row.customerId}`
    : `/admin/subscriptions/canonical/${row.id}`;
}

export default async function CanonicalSubscriptionsPage({ searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const {
    q = "",
    view = "all",
    collection = "",
    lifecycle = "",
    control = "",
    provider = "",
  } = await searchParams;
  const allRows = await listCanonicalSubscriptionAdminRows();
  const rows = filterCanonicalSubscriptionAdminRows(allRows, {
    query: q,
    view,
    collectionMethod: collection,
    lifecycleStatus: lifecycle,
    controlMode: control,
    providerStatus: provider,
  });
  const canonicalRows = allRows.filter((row) => row.controlMode !== "legacy");
  const cycleMrr = canonicalRows.reduce((sum, row) => sum + Number(row.normalizedMrr ?? 0), 0);
  const draftCount = allRows.filter((row) => row.access === "editable_draft").length;
  const migratedCount = allRows.filter((row) => row.access === "migrated_shadow_read_only").length;
  const attentionCount = allRows.filter((row) => row.attentionRequired).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500">Billing / Subscriptions / Canonical preview</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Canonical subscriptions</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            One row per commercial subscription. UI-2 adds operational filters and read-only provider, collection, and attention context.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/subscriptions" className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700">Legacy operations</Link>
          <Link href="/admin/subscriptions/canonical/pilot" className="rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">Manual pilot review</Link>
          <Link href="/admin/subscriptions/canonical/demo" className="rounded-lg border border-blue-300 px-4 py-2.5 text-sm font-semibold text-blue-800 dark:border-blue-800 dark:text-blue-300">View synthetic demo</Link>
          {canonicalSubscriptionUiEnabled() ? <Link href="/admin/subscriptions/canonical/new" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Create shadow draft</Link> : null}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Preview MRR</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatExpenseAmount(cycleMrr, "XCD")}</p><p className="mt-1 text-xs text-zinc-500">Normalized monthly equivalent</p></div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Canonical records</p><p className="mt-2 text-2xl font-semibold tabular-nums">{canonicalRows.length}</p><p className="mt-1 text-xs text-zinc-500">Shadow and canonical</p></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">Editable drafts</p><p className="mt-2 text-2xl font-semibold tabular-nums">{draftCount}</p><p className="mt-1 text-xs text-zinc-500">Unmigrated shadows only</p></div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/50 dark:bg-violet-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">Migrated shadows</p><p className="mt-2 text-2xl font-semibold tabular-nums">{migratedCount}</p><p className="mt-1 text-xs text-zinc-500">Read-only during this phase</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/25"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Needs attention</p><p className="mt-2 text-2xl font-semibold tabular-nums">{attentionCount}</p><p className="mt-1 text-xs text-zinc-500">Collection or provider review</p></div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input name="q" defaultValue={q} placeholder="Search customer, subscription or reference" className="min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm lg:col-span-2 dark:border-zinc-700 dark:bg-zinc-950" />
          <select name="view" defaultValue={view} aria-label="Arrangement view" className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="all">All arrangements</option><option value="drafts">Editable drafts</option><option value="migrated">Migrated shadows</option><option value="canonical">Canonical</option><option value="legacy">Legacy</option></select>
          <select name="collection" defaultValue={collection} aria-label="Collection method" className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="">All collection</option><option value="manual_invoice">Manual invoice</option><option value="stripe_autocharge">Stripe autocharge</option></select>
          <select name="lifecycle" defaultValue={lifecycle} aria-label="Lifecycle status" className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="">All lifecycle</option><option value="draft">Draft</option><option value="pending_activation">Pending activation</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option><option value="canceled">Canceled</option></select>
          <select name="control" defaultValue={control} aria-label="Control mode" className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="">All control modes</option><option value="canonical">Canonical</option><option value="shadow">Shadow</option><option value="legacy">Legacy</option></select>
          <select name="provider" defaultValue={provider} aria-label="Provider status" className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="">All provider status</option><option value="not_connected">Not connected</option><option value="linked_observation_unavailable">Observation unavailable</option><option value="attention">Needs provider review</option><option value="not_applicable">Not applicable</option></select>
          <button className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2 lg:col-span-6 lg:justify-self-end dark:bg-zinc-100 dark:text-zinc-900">Apply filters</button>
        </form>
      </section>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900"><h2 className="font-semibold">No subscriptions in this view</h2><p className="mt-1 text-sm text-zinc-500">Create a shadow draft or adjust the search and filters.</p></div>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => <article key={row.id} className={`rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${row.attentionRequired ? "ring-1 ring-amber-300 dark:ring-amber-800" : ""}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.customer}</p><p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{row.name}{row.reference ? ` · ${row.reference}` : ""}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(row)}`}>{canonicalControlLabel(row.access)}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zinc-500">Collection</dt><dd className="mt-1 font-medium">{collectionLabel(row.collectionMethod)}</dd></div><div><dt className="text-xs text-zinc-500">Provider</dt><dd className="mt-1 font-medium">{canonicalProviderStatusLabel(row.providerStatus)}</dd></div><div><dt className="text-xs text-zinc-500">Frequency</dt><dd className="mt-1 font-medium">{canonicalIntervalLabel(row.billingIntervalMonths)}</dd></div><div><dt className="text-xs text-zinc-500">Cycle / MRR</dt><dd className="mt-1 font-medium tabular-nums">{money(row.recurringCycleTotal, row.currency)} / {money(row.normalizedMrr, row.currency)}</dd></div><div><dt className="text-xs text-zinc-500">Next billing</dt><dd className="mt-1 font-medium">{date(row.nextBillingDate)}</dd></div><div><dt className="text-xs text-zinc-500">Health</dt><dd className="mt-1 font-medium capitalize">{row.collectionHealth?.replaceAll("_", " ") ?? "No native history"}</dd></div></dl><Link href={destination(row)} className="mt-4 block rounded-lg border border-zinc-300 px-3 py-2 text-center text-sm font-semibold text-emerald-700 dark:border-zinc-700 dark:text-emerald-400">Open {row.controlMode === "legacy" ? "legacy workflow" : "details"}</Link></article>)}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
            <table className="min-w-[1280px] divide-y divide-zinc-200 text-sm dark:divide-zinc-800"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400"><tr><th className="px-4 py-3">Customer / subscription</th><th className="px-4 py-3">Collection</th><th className="px-4 py-3">Frequency</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Control</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3 text-right">Services</th><th className="px-4 py-3 text-right">Cycle total</th><th className="px-4 py-3 text-right">MRR</th><th className="px-4 py-3">Next billing</th><th className="px-4 py-3">Health</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{rows.map((row) => <tr key={row.id} className={row.attentionRequired ? "bg-amber-50/40 dark:bg-amber-950/10" : undefined}><td className="px-4 py-3"><p className="font-medium">{row.customer}</p><p className="text-xs text-zinc-500">{row.name}{row.reference ? ` · ${row.reference}` : ""}</p></td><td className="px-4 py-3">{collectionLabel(row.collectionMethod)}</td><td className="px-4 py-3">{canonicalIntervalLabel(row.billingIntervalMonths)}</td><td className="px-4 py-3 capitalize">{row.lifecycleStatus.replaceAll("_", " ")}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(row)}`}>{canonicalControlLabel(row.access)}</span></td><td className="px-4 py-3">{canonicalProviderStatusLabel(row.providerStatus)}</td><td className="px-4 py-3 text-right tabular-nums">{row.itemCount}</td><td className="px-4 py-3 text-right tabular-nums">{money(row.recurringCycleTotal, row.currency)}</td><td className="px-4 py-3 text-right tabular-nums">{money(row.normalizedMrr, row.currency)}</td><td className="px-4 py-3">{date(row.nextBillingDate)}</td><td className="px-4 py-3 capitalize">{row.collectionHealth?.replaceAll("_", " ") ?? "Legacy workflow"}</td><td className="px-4 py-3 text-right"><Link href={destination(row)} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Open</Link></td></tr>)}</tbody></table>
          </div>
        </>
      )}
      <p className="text-xs text-zinc-500">Provider observation is intentionally read-only here. “Observation unavailable” means TL has a local provider link but this screen has not loaded live Stripe state. Legacy recurring invoice schedules remain in the existing screens.</p>
    </div>
  );
}
