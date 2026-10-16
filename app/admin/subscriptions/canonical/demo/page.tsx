import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { previewAnnualProration } from "@/lib/domain/canonical-subscription-application";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";

const annualPreview = previewAnnualProration({
  annualPeriodStart: "2026-01-01",
  annualPeriodEnd: "2027-01-01",
  serviceActivatedDate: "2026-09-17",
  agreedAnnualAmount: "275.00",
  currency: "XCD",
});

function money(value: string | number) {
  return `EC$${Number(value).toFixed(2)}`;
}

export default async function CanonicalSubscriptionDemoPage() {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/subscriptions/canonical" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Back to canonical subscriptions</Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Synthetic demonstration only</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Canonical subscription preview</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">These examples are rendered from in-memory values. They are not customer, subscription, invoice, payment, device, or provider records.</p>
        </div>
        <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200">No database writes</span>
      </div>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100"><p className="font-semibold">What this demonstrates</p><p className="mt-1">Multiple independent arrangements, exact negotiated rates, annual proration, manual versus Stripe collection context, and reconciliation states that require review.</p></section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-zinc-500">Example Fleet Ltd</p><h2 className="mt-1 font-semibold">Monthly tracking agreement</h2><p className="mt-1 text-sm text-zinc-500">Three services · manual invoice · active</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Canonical preview</span></div><div className="mt-5 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700"><div className="flex justify-between gap-3 px-3 py-2 text-sm"><span>Vehicle A · standard</span><span className="tabular-nums">EC$25.00</span></div><div className="flex justify-between gap-3 px-3 py-2 text-sm"><span>Vehicle B · standard</span><span className="tabular-nums">EC$25.00</span></div><div className="flex justify-between gap-3 px-3 py-2 text-sm"><span>Vehicle C · negotiated</span><span className="tabular-nums">EC$20.00</span></div><div className="flex justify-between gap-3 px-3 py-3 font-semibold"><span>Monthly total</span><span className="tabular-nums">EC$70.00</span></div></div><p className="mt-3 text-xs text-zinc-500">Negotiated pricing remains explicit and is not reconstructed from a catalog discount.</p></article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-zinc-500">Example Annual Services</p><h2 className="mt-1 font-semibold">Annual agreement</h2><p className="mt-1 text-sm text-zinc-500">One service · Stripe autocharge · annual</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">Review required</span></div><dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700"><div><dt className="text-xs text-zinc-500">Agreed annual price</dt><dd className="mt-1 font-semibold tabular-nums">{money("275.00")}</dd></div><div><dt className="text-xs text-zinc-500">Normalized monthly equivalent</dt><dd className="mt-1 font-semibold tabular-nums">{money((275 / 12).toFixed(2))}</dd></div><div><dt className="text-xs text-zinc-500">Provider state</dt><dd className="mt-1 font-medium">Local link · observation unavailable</dd></div><div><dt className="text-xs text-zinc-500">Renewal</dt><dd className="mt-1 font-medium">Preserved anniversary</dd></div></dl><p className="mt-3 text-xs text-zinc-500">No Stripe call or activation is performed by this demonstration.</p></article>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/60 dark:bg-amber-950/20"><h2 className="font-semibold">Annual adjustment preview</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Synthetic addition activated September 17, 2026 during the January 1, 2026 to January 1, 2027 annual period.</p><dl className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-white p-3 dark:bg-zinc-900"><dt className="text-xs text-zinc-500">Prorated preview</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(annualPreview.proratedAmount.toString())}</dd></div><div className="rounded-lg bg-white p-3 dark:bg-zinc-900"><dt className="text-xs text-zinc-500">Days remaining</dt><dd className="mt-1 text-lg font-semibold">{annualPreview.remainingCalendarDays} / {annualPreview.totalCalendarDays}</dd></div><div className="rounded-lg bg-white p-3 dark:bg-zinc-900"><dt className="text-xs text-zinc-500">Future recurring date</dt><dd className="mt-1 text-lg font-semibold">{annualPreview.futureRecurringEffectiveDate}</dd></div></dl><p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">This is a preview only. It does not create an adjustment invoice, payment, schedule change, or provider operation.</p></section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Reconciliation examples</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20"><p className="font-semibold text-emerald-900 dark:text-emerald-200">Manual collection</p><p className="mt-1 text-zinc-600 dark:text-zinc-300">Provider relationship not applicable. Native invoice history is the collection source.</p></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20"><p className="font-semibold text-amber-900 dark:text-amber-200">Observation unavailable</p><p className="mt-1 text-zinc-600 dark:text-zinc-300">A local Stripe link exists, but live provider state has not been loaded.</p></div><div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/20"><p className="font-semibold text-red-900 dark:text-red-200">Mismatch review</p><p className="mt-1 text-zinc-600 dark:text-zinc-300">A price, quantity, or billing-date difference must be reviewed before any execution phase.</p></div></div></section>
    </div>
  );
}
