import Link from "next/link";

import { SubscriptionCatalogRowForm } from "@/components/admin/subscription-catalog-row-form";
import { catalogTierLabel, CATALOG_RATE_TIERS_XCD } from "@/lib/domain/billing-catalog";
import { prisma } from "@/lib/db";
import { catalogEnvKey } from "@/lib/stripe/catalog-price-ids";
import { formatPlanTerm, formatSubscriptionChoiceLabel } from "@/lib/subscription-options/display";
import { ensureSubscriptionCatalogRows } from "@/lib/subscription-options/ensure-catalog";
import { ensureSubscriptionPlanRows } from "@/lib/subscription-options/ensure-plans";

export default async function SubscriptionOptionsPage() {
  await ensureSubscriptionPlanRows();
  await ensureSubscriptionCatalogRows();

  const [options, catalogPrices] = await Promise.all([
    prisma.subscriptionOption.findMany({
      orderBy: { durationMonths: "asc" },
      include: { _count: { select: { registrationRequests: true } } },
    }),
    prisma.subscriptionCatalogPrice.findMany({
      orderBy: [{ monthlyRateXcd: "asc" }, { durationMonths: "asc" }],
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Subscription options</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Four fixed plans (1, 3, 6, and 12 month). Prices are in XCD (Eastern Caribbean dollars); only the price for each
            plan can be edited. The public form shows &quot;Billed monthly per vehicle&quot; under the dropdown. The
            applicant&apos;s choice is copied into customer
            notes on approval (Invoiless remains a separate admin step).
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Plan (shown on /register)</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3 text-right">Used in registrations</th>
              <th className="px-4 py-3 text-right"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {options.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No plans found (this should not happen).
                </td>
              </tr>
            ) : (
              options.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                    {formatSubscriptionChoiceLabel(o.durationMonths, o.priceXcd)}
                  </td>
                  <td className="px-4 py-3">
                    {o.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                        Yes
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-600 dark:text-zinc-200">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {o._count.registrationRequests}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/subscription-options/${o.id}/edit`}
                      className="font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                    >
                      Edit price
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Stripe catalog (per vehicle)</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            Map each monthly rate tier and billing term to a Stripe Price id (
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">price_…</code>). Checkout uses{" "}
            <strong>quantity = vehicle count</strong> on that Price. Tiers:{" "}
            {CATALOG_RATE_TIERS_XCD.map((t) => `${t} XCD`).join(", ")} per vehicle / month. Non-catalog custom rates
            still use dynamic pricing at checkout.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Stripe Price id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {catalogPrices.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">{catalogTierLabel(Number(row.monthlyRateXcd))}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{formatPlanTerm(row.durationMonths)}</td>
                  <td className="px-4 py-3">
                    <SubscriptionCatalogRowForm
                      id={row.id}
                      monthlyRateXcd={Number(row.monthlyRateXcd)}
                      durationMonths={row.durationMonths}
                      stripePriceId={row.stripePriceId}
                      envHint={catalogEnvKey(Number(row.monthlyRateXcd), row.durationMonths)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
