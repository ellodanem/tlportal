"use client";

import Link from "next/link";
import { useState } from "react";

import { displayDate } from "@/components/admin/canonical-subscription/format";
import {
  isRetiredSubscriptionLifecycle,
  retiredSubscriptionSiblingCount,
  visibleSubscriptionSiblings,
} from "@/lib/domain/canonical-subscription-admin";
import { subscriptionBasePath } from "@/lib/domain/canonical-subscription-navigation";
import { cadenceLabel } from "@/lib/domain/subscription-proration";

export type SubscriptionSiblingChip = {
  id: string;
  lifecycleStatus: string | null;
  billingIntervalMonths: number | null;
  /** Server Dates serialize to ISO strings when this nav hydrates on the client. */
  nextBillingDate: Date | string | null;
  serviceCount: number;
  isCurrent: boolean;
};

function lifecycleLabel(status: string | null) {
  return (status ?? "unclassified").replaceAll("_", " ");
}

function renewalLabel(value: Date | string | null) {
  if (!value) return "No renewal date";
  return `Renews ${displayDate(value instanceof Date ? value : new Date(value))}`;
}

export function SubscriptionSiblingsNav({ siblings }: { siblings: SubscriptionSiblingChip[] }) {
  const [showEnded, setShowEnded] = useState(false);
  const endedCount = retiredSubscriptionSiblingCount(siblings);
  const visible = visibleSubscriptionSiblings(siblings, showEnded);
  const currentCount = siblings.filter((sibling) => !isRetiredSubscriptionLifecycle(sibling.lifecycleStatus)).length;

  if (siblings.length <= 1) return null;
  if (visible.length <= 1 && endedCount === 0) return null;

  const heading = endedCount
    ? (currentCount > 1
      ? `This customer has ${currentCount} current subscriptions. Each bills on its own schedule.`
      : currentCount === 1
        ? "This customer has 1 current subscription."
        : "This customer has no current subscriptions.")
    : `This customer has ${siblings.length} subscriptions. Each bills on its own schedule.`;

  return (
    <nav aria-label="Other subscriptions for this customer" className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{heading}</p>
        {endedCount ? (
          <button
            type="button"
            onClick={() => setShowEnded((value) => !value)}
            aria-pressed={showEnded}
            className="inline-flex min-h-11 w-fit shrink-0 items-center rounded-lg px-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:min-h-0 sm:py-1 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            {showEnded ? "Hide ended agreements" : `Show ${endedCount} ended agreement${endedCount === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>
      {visible.length ? (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {visible.map((sibling) => {
            const retired = isRetiredSubscriptionLifecycle(sibling.lifecycleStatus);
            return (
              <li key={sibling.id} className="shrink-0">
                <Link
                  href={subscriptionBasePath(sibling.id)}
                  aria-current={sibling.isCurrent ? "page" : undefined}
                  className={`block rounded-lg border px-3 py-2 text-sm ${
                    sibling.isCurrent
                      ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
                      : retired
                        ? "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
                        : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="block font-semibold">{cadenceLabel(sibling.billingIntervalMonths)} · {sibling.serviceCount} service{sibling.serviceCount === 1 ? "" : "s"}{sibling.isCurrent ? " · this one" : ""}</span>
                  <span className="block text-xs text-zinc-500">{renewalLabel(sibling.nextBillingDate)} · {lifecycleLabel(sibling.lifecycleStatus)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 px-1 text-sm text-zinc-500">No current subscriptions. Use Show ended agreements to open the audit copies.</p>
      )}
    </nav>
  );
}
