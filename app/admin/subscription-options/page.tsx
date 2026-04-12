import Link from "next/link";

import { prisma } from "@/lib/db";
import { formatSubscriptionChoiceLabel } from "@/lib/subscription-options/display";
import { ensureSubscriptionPlanRows } from "@/lib/subscription-options/ensure-plans";

export default async function SubscriptionOptionsPage() {
  await ensureSubscriptionPlanRows();

  const options = await prisma.subscriptionOption.findMany({
    orderBy: { durationMonths: "asc" },
    include: { _count: { select: { registrationRequests: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Subscription options</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
            Four fixed plans (1, 3, 6, and 12 month). Only the price for each plan can be edited; the public form shows
            &quot;Billed monthly per vehicle&quot; under the dropdown. The applicant&apos;s choice is copied into customer
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
                    {formatSubscriptionChoiceLabel(o.durationMonths, o.priceUsd)}
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
    </div>
  );
}
