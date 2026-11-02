import Link from "next/link";
import { redirect } from "next/navigation";

import { cardClass, iso, money } from "@/components/admin/canonical-subscription/format";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";
import { subscriptionBasePath } from "@/lib/domain/canonical-subscription-navigation";
import { previewAnnualSubscriptionAddition } from "@/lib/services/canonical-subscription-application-service";

type Props = {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ periodStart?: string; periodEnd?: string; activationDate?: string; annualAmount?: string }>;
};

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950";

export default async function CanonicalAnnualAdjustmentPage({ params, searchParams }: Props) {
  const [{ subscriptionId }, query] = await Promise.all([params, searchParams]);
  const { subscription } = await requireSubscriptionPage(subscriptionId);
  const billingPath = `${subscriptionBasePath(subscription.id)}/billing`;
  if (subscription.billingIntervalMonths !== 12 || subscription.controlMode === "legacy") redirect(billingPath);

  let annualPreview: Awaited<ReturnType<typeof previewAnnualSubscriptionAddition>> | null = null;
  let annualPreviewError: string | null = null;
  if (query.periodStart && query.periodEnd && query.activationDate) {
    try {
      annualPreview = await previewAnnualSubscriptionAddition({ subscriptionId, annualPeriodStart: query.periodStart, annualPeriodEnd: query.periodEnd, serviceActivatedDate: query.activationDate, agreedAnnualAmount: query.annualAmount || null });
    } catch (error) {
      annualPreviewError = error instanceof Error ? error.message : "The annual preview could not be calculated.";
    }
  }

  return (
    <section aria-labelledby="annual-adjustment-heading" className={`${cardClass} p-5`}>
      <Link href={billingPath} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Billing</Link>
      <h2 id="annual-adjustment-heading" className="mt-3 text-lg font-semibold">Annual addition and adjustment preview</h2>
      <p className="mt-2 text-sm text-zinc-500">Preview only. This does not authorize collection, create an invoice, or advance the recurring schedule. Issuing an agreed partial-period charge is done from the agreed charges on Billing.</p>
      <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium">Period start<input required type="date" name="periodStart" defaultValue={query.periodStart ?? iso(subscription.billingAnchorDate)} className={inputClass} /></label>
        <label className="text-sm font-medium">Period end<input required type="date" name="periodEnd" defaultValue={query.periodEnd ?? iso(subscription.nextBillingDate)} className={inputClass} /></label>
        <label className="text-sm font-medium">Activation date<input required type="date" name="activationDate" defaultValue={query.activationDate} className={inputClass} /></label>
        <label className="text-sm font-medium">Annual amount<input name="annualAmount" inputMode="decimal" defaultValue={query.annualAmount ?? subscription.agreedAmountPerCycle?.toString()} className={inputClass} /></label>
        <button className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold sm:col-span-2 lg:col-span-4 dark:border-zinc-700">Calculate preview</button>
      </form>
      {annualPreview ? <p role="status" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-100">Prorated preview: {money(annualPreview.proratedAmount.toString(), annualPreview.currency)} · effective {annualPreview.futureRecurringEffectiveDate}</p> : null}
      {annualPreviewError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{annualPreviewError}</p> : null}
    </section>
  );
}
