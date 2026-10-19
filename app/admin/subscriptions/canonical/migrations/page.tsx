import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { approveMigrationCampaignAction } from "@/app/admin/subscriptions/canonical/migrations/actions";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";
import { getCanonicalMigrationCampaignDashboard } from "@/lib/services/canonical-migration-campaign-service";

type Props = { searchParams: Promise<{ collection?: string; view?: string; customer?: string; error?: string }> };

function badgeClass(value: string) {
  if (value === "eligible" || value === "migrated") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (value === "review_required") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
}

export default async function CanonicalMigrationCampaignPage({ searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const { collection = "", view = "all", customer = "", error = "" } = await searchParams;
  const dashboard = await getCanonicalMigrationCampaignDashboard();
  const candidates = dashboard.candidates.filter((candidate) => {
    if (collection && candidate.collectionMethod !== collection) return false;
    if (view !== "all" && candidate.eligibility !== view) return false;
    if (customer && candidate.customerId !== customer) return false;
    return true;
  });
  const eligible = candidates.filter((candidate) => candidate.eligibility === "eligible");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/subscriptions/canonical" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Back to canonical subscriptions</Link>
          <p className="mt-4 text-xs font-medium text-zinc-500">Billing / Canonical / Migration campaign</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Customer migration campaign</h1>
          <p className="mt-1 max-w-4xl text-sm text-zinc-600 dark:text-zinc-400">Review each legacy arrangement against its services, recurring terms, paid-through evidence, balances, and provider state. Approval creates protected canonical shadows only; legacy billing remains authoritative and no invoice, payment, Stripe change, or notification is created.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href="/admin/subscriptions/canonical/migrations/invoices" className="rounded-lg border border-amber-300 px-4 py-2.5 text-center text-sm font-semibold text-amber-900 dark:border-amber-800 dark:text-amber-200">Classify one-off invoices</Link><Link href="/admin/subscriptions" className="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-semibold dark:border-zinc-700">Legacy operations</Link></div>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Eligible", dashboard.counts.eligible, "Safe manual schedule shadows"],
          ["Migrated", dashboard.counts.migrated, "Shadow records already created"],
          ["Needs review", dashboard.counts.reviewRequired, "Commercial or provider confirmation"],
          ["Blocked", dashboard.counts.blocked, "Ambiguous coverage, pricing, or balance"],
          ["Legacy authority", dashboard.counts.legacyAuthorityRemaining, "Still billed by existing workflow"],
        ].map(([label, count, detail]) => <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{count}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>)}
      </section>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <p className="font-semibold">Financial boundary</p>
        <p className="mt-1">Paid-through dates shown here come from the arrangement&apos;s own recurring schedule or stored Stripe period—not a blanket October assumption. Any standalone invoice coverage, open balance, pricing variance, declined card, or future Stripe collection remains a review exception.</p>
      </section>

      <form method="get" className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
        <select name="collection" defaultValue={collection} className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="">All collection methods</option><option value="manual_invoice">Manual invoice</option><option value="stripe_autocharge">Stripe autocharge</option></select>
        <select name="view" defaultValue={view} className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="all">All review states</option><option value="eligible">Eligible</option><option value="review_required">Needs review</option><option value="blocked">Blocked</option><option value="migrated">Migrated</option></select>
        <button className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700">Apply filters</button>
        <p className="self-center text-xs text-zinc-500">Source analysis: {dashboard.analysisDate}</p>
      </form>

      <form action={approveMigrationCampaignAction} className="space-y-4 rounded-xl border border-emerald-200 bg-white p-4 sm:p-6 dark:border-emerald-900 dark:bg-zinc-900">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-semibold">Owner-approved migration batch</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Select only eligible manual arrangements. Every selected customer gets an independent transaction, retry record, and outcome.</p></div><p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{eligible.length} eligible in this view</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Campaign title<input required name="title" defaultValue="Legacy customer migration" className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="text-sm font-medium">Owner approval reason<textarea required name="approvalReason" rows={2} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-950" placeholder="Why these exact arrangements are ready for protected canonical shadow migration" /></label></div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">{[["confirmSource", "I reviewed the exact source terms and service assignments."], ["confirmPaidThrough", "I verified paid-through evidence and the next renewal date for every selection."], ["confirmHistory", "I understand invoices, payments, balances, and historical records are preserved."], ["confirmLegacyAuthority", "I understand legacy billing remains the only billing authority after this shadow migration."]].map(([name, label]) => <label key={name} className="flex items-start gap-2"><input required type="checkbox" name={name} value="yes" className="mt-1" /><span>{label}</span></label>)}</div>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"><table className="min-w-[1040px] w-full text-sm"><thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950"><tr><th className="px-3 py-3">Select</th><th className="px-3 py-3">Customer / source</th><th className="px-3 py-3">Terms / services</th><th className="px-3 py-3">Paid through / renewal</th><th className="px-3 py-3 text-right">Cycle</th><th className="px-3 py-3">Review</th></tr></thead><tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{candidates.map((candidate) => <tr key={candidate.proposalId} className={candidate.eligibility === "eligible" ? "" : "bg-zinc-50/70 dark:bg-zinc-950/30"}><td className="px-3 py-3"><input type="checkbox" name="proposalId" value={candidate.proposalId} disabled={candidate.eligibility !== "eligible"} aria-label={`Select ${candidate.customerLabel}`} /></td><td className="px-3 py-3"><Link href={`/admin/subscriptions/canonical/migrations/review/${encodeURIComponent(candidate.proposalId)}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{candidate.customerLabel}</Link><p className="text-xs text-zinc-500">{candidate.sourceKind.replaceAll("_", " ")} · {candidate.sourceId}</p></td><td className="px-3 py-3">{candidate.serviceCount} service{candidate.serviceCount === 1 ? "" : "s"} · every {candidate.billingIntervalMonths} month{candidate.billingIntervalMonths === 1 ? "" : "s"}<p className="text-xs text-zinc-500">{candidate.collectionMethod === "stripe_autocharge" ? "Stripe autocharge" : "Manual invoice"}</p></td><td className="px-3 py-3">{candidate.paidThroughDate ?? "Unresolved"}<p className="text-xs text-zinc-500">Next: {candidate.nextBillingDate ?? "Unresolved"}</p></td><td className="px-3 py-3 text-right tabular-nums">{candidate.cycleAmount == null ? "Unresolved" : formatExpenseAmount(Number(candidate.cycleAmount), candidate.currency)}<p className="text-xs text-zinc-500">Balance {formatExpenseAmount(Number(candidate.outstandingBalance), candidate.currency)}</p></td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeClass(candidate.eligibility)}`}>{candidate.eligibility.replaceAll("_", " ")}</span>{[...candidate.blockers, ...candidate.issueMessages].slice(0, 2).map((message) => <p key={message} className="mt-1 max-w-xs text-xs text-zinc-500">{message}</p>)}</td></tr>)}</tbody></table></div>
        <button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Approve selected shadow migrations</button>
      </form>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Campaign progress</h2>{dashboard.campaigns.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No owner-approved campaigns yet.</p> : <div className="mt-3 grid gap-2">{dashboard.campaigns.map((campaign) => <Link key={campaign.id} href={`/admin/subscriptions/canonical/migrations/${campaign.id}`} className="rounded-lg border border-zinc-200 p-3 hover:border-emerald-300 dark:border-zinc-800"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="font-medium">{campaign.title}</span><span className="text-xs text-zinc-500">{campaign.status.replaceAll("_", " ")} · {campaign.approvedAt.toLocaleDateString()}</span></div><p className="mt-1 text-xs text-zinc-500">Approved by {campaign.approvedBy} · {Object.entries(campaign.entryCounts).map(([status, count]) => `${count} ${status.replaceAll("_", " ")}`).join(" · ")}</p></Link>)}</div>}</section>
    </div>
  );
}
