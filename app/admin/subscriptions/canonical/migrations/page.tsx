import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { approveMigrationCampaignAction } from "@/app/admin/subscriptions/canonical/migrations/actions";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";
import {
  getCanonicalMigrationCampaignDashboard,
  type MigrationCampaignCandidate,
} from "@/lib/services/canonical-migration-campaign-service";

type Props = { searchParams: Promise<{ collection?: string; view?: string; customer?: string; error?: string }> };

const STATUS_LABEL = {
  not_migrated: "Not migrated",
  ready: "Ready to migrate",
  needs_attention: "Needs attention",
  migrated: "Migrated",
  blocked: "Blocked",
} as const;

function badgeClass(value: keyof typeof STATUS_LABEL) {
  if (value === "migrated" || value === "ready") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (value === "needs_attention" || value === "not_migrated") return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
}

function collectionLabel(value: string | null) {
  return value === "stripe_autocharge" ? "Stripe autocharge" : "Manual invoice";
}

function customerStatus(arrangements: MigrationCampaignCandidate[]): MigrationCampaignCandidate["operationalStatus"] {
  if (arrangements.every((candidate) => candidate.operationalStatus === "migrated")) return "migrated";
  if (arrangements.some((candidate) => candidate.operationalStatus === "blocked")) return "blocked";
  if (arrangements.some((candidate) => candidate.operationalStatus === "needs_attention")) return "needs_attention";
  if (arrangements.some((candidate) => candidate.operationalStatus === "ready")) return "ready";
  return "not_migrated";
}

function groupByCustomer(candidates: MigrationCampaignCandidate[]) {
  const grouped = new Map<string, MigrationCampaignCandidate[]>();
  for (const candidate of candidates) {
    const arrangements = grouped.get(candidate.customerId) ?? [];
    arrangements.push(candidate);
    grouped.set(candidate.customerId, arrangements);
  }
  return [...grouped.entries()].map(([customerId, arrangements]) => ({
    customerId,
    customerLabel: arrangements[0]!.customerLabel,
    arrangements,
    status: customerStatus(arrangements),
  }));
}

export default async function CanonicalMigrationCampaignPage({ searchParams }: Props) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const { collection = "", view = "all", customer = "", error = "" } = await searchParams;
  const dashboard = await getCanonicalMigrationCampaignDashboard();
  const candidates = dashboard.candidates.filter((candidate) => {
    if (collection && candidate.collectionMethod !== collection) return false;
    if (view !== "all" && candidate.operationalStatus !== view) return false;
    if (customer && candidate.customerId !== customer) return false;
    return true;
  });
  const customers = [...new Map(dashboard.candidates.map((candidate) => [candidate.customerId, candidate.customerLabel])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]));
  const customerGroups = groupByCustomer(candidates);
  const allCustomerGroups = groupByCustomer(dashboard.candidates);
  const count = (status: keyof typeof STATUS_LABEL) => allCustomerGroups.filter((group) => group.status === status).length;
  const batchEligible = candidates.filter((candidate) => candidate.eligibility === "eligible");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/subscriptions/canonical" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Back to canonical subscriptions</Link>
          <p className="mt-4 text-xs font-medium text-zinc-500">Billing / Canonical / Customer migration</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Migrate a customer</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">Select a customer, review the arrangement TL Portal found, then confirm and migrate. Existing financial history remains unchanged.</p>
        </div>
        <Link href="/admin/subscriptions/canonical/migrations/invoices" className="rounded-lg border border-amber-300 px-4 py-2.5 text-center text-sm font-semibold text-amber-900 dark:border-amber-800 dark:text-amber-200">Classify one-off invoices</Link>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {([
          ["Ready to migrate", count("ready"), "Complete manual arrangements"],
          ["Needs attention", count("needs_attention"), "Review a specific discrepancy"],
          ["Migrated", count("migrated"), "Canonical future billing owns renewal"],
          ["Blocked", count("blocked"), "Missing or conflicting evidence"],
          ["Not migrated", count("not_migrated"), "Legacy billing remains active"],
        ] as const).map(([label, value, detail]) => <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>)}
      </section>

      <form method="get" className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] dark:border-zinc-800 dark:bg-zinc-900">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer<select name="customer" defaultValue={customer} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-normal normal-case dark:border-zinc-700 dark:bg-zinc-950"><option value="">All customers</option>{customers.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Payment method<select name="collection" defaultValue={collection} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-normal normal-case dark:border-zinc-700 dark:bg-zinc-950"><option value="">All methods</option><option value="manual_invoice">Manual invoice</option><option value="stripe_autocharge">Stripe autocharge</option></select></label>
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status<select name="view" defaultValue={view} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-normal normal-case dark:border-zinc-700 dark:bg-zinc-950"><option value="all">All statuses</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="self-end rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">Apply</button>
      </form>

      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-4 sm:p-5 dark:border-zinc-800"><h2 className="font-semibold">Existing customers</h2><p className="mt-1 text-sm text-zinc-500">Each customer appears once. Genuinely separate current arrangements remain listed inside the customer record.</p></div>
        {customerGroups.length === 0 ? <p className="p-6 text-sm text-zinc-500">No customers match these filters.</p> : <div className="divide-y divide-zinc-200 dark:divide-zinc-800">{customerGroups.map((group) => (
          <article key={group.customerId} className="p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 className="font-semibold">{group.customerLabel}</h3><p className="text-xs text-zinc-500">{group.arrangements.length} current arrangement{group.arrangements.length === 1 ? "" : "s"}</p></div>
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(group.status)}`}>{STATUS_LABEL[group.status]}</span>
            </div>
            <div className="mt-4 space-y-3">{group.arrangements.map((candidate) => (
              <div key={candidate.proposalId} className="grid gap-3 rounded-lg border border-zinc-200 p-3 text-sm md:grid-cols-[minmax(150px,1.2fr)_90px_120px_120px_minmax(180px,1fr)_auto] md:items-center dark:border-zinc-800">
                <div><p className="font-medium">{collectionLabel(candidate.collectionMethod)}</p><p className="text-xs text-zinc-500">{candidate.sourceKind.replaceAll("_", " ")} · every {candidate.billingIntervalMonths} month{candidate.billingIntervalMonths === 1 ? "" : "s"}</p></div>
                <div><p className="text-xs text-zinc-500">Services</p><p className="font-medium tabular-nums">{candidate.serviceCount}</p></div>
                <div><p className="text-xs text-zinc-500">Recurring</p><p className="font-medium tabular-nums">{candidate.cycleAmount == null ? "Unresolved" : formatExpenseAmount(Number(candidate.cycleAmount), candidate.currency)}</p></div>
                <div><p className="text-xs text-zinc-500">Next billing</p><p className="font-medium">{candidate.nextBillingDate ?? "Unresolved"}</p></div>
                <div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(candidate.operationalStatus)}`}>{STATUS_LABEL[candidate.operationalStatus]}</span>{candidate.blockers[0] ? <p className="mt-2 text-xs text-zinc-500">{candidate.blockers[0]}</p> : null}</div>
                <Link href={`/admin/subscriptions/canonical/migrations/review/${encodeURIComponent(candidate.proposalId)}`} className="rounded-lg border border-emerald-300 px-3 py-2 text-center font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300">{candidate.operationalStatus === "migrated" ? "View" : "Migrate"}</Link>
              </div>
            ))}</div>
          </article>
        ))}</div>}
      </section>

      <details className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer font-semibold">Batch migration tools</summary>
        <p className="mt-2 text-sm text-zinc-500">The existing batch workflow remains available for protected shadow preparation. Individual migrations above are the normal operational path.</p>
        <form action={approveMigrationCampaignAction} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Campaign title<input required name="title" defaultValue="Legacy customer migration" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal dark:bg-zinc-950" /></label><label className="text-sm font-medium">Owner approval reason<textarea required name="approvalReason" rows={2} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal dark:bg-zinc-950" /></label></div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">{[["confirmSource", "I reviewed the exact source terms and service assignments."], ["confirmPaidThrough", "I verified paid-through evidence and next renewal."], ["confirmHistory", "Existing financial history remains unchanged."], ["confirmLegacyAuthority", "Legacy billing remains authoritative after batch shadow preparation."]].map(([name, label]) => <label key={name} className="flex items-start gap-2"><input required type="checkbox" name={name} value="yes" className="mt-1" /><span>{label}</span></label>)}</div>
          <div className="grid gap-2 sm:grid-cols-2">{batchEligible.map((candidate) => <label key={candidate.proposalId} className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"><input type="checkbox" name="proposalId" value={candidate.proposalId} /><span><strong>{candidate.customerLabel}</strong><span className="block text-xs text-zinc-500">{candidate.serviceCount} services · {collectionLabel(candidate.collectionMethod)}</span></span></label>)}</div>
          <button className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700">Approve selected shadow migrations</button>
        </form>
      </details>

      {dashboard.campaigns.length ? <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Recent migration activity</h2><div className="mt-3 grid gap-2">{dashboard.campaigns.map((campaign) => <Link key={campaign.id} href={`/admin/subscriptions/canonical/migrations/${campaign.id}`} className="rounded-lg border border-zinc-200 p-3 hover:border-emerald-300 dark:border-zinc-800"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="font-medium">{campaign.title}</span><span className="text-xs text-zinc-500">{campaign.status.replaceAll("_", " ")} · {campaign.approvedAt.toLocaleDateString()}</span></div></Link>)}</div></section> : null}
    </div>
  );
}
