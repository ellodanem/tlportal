import type { ReactNode } from "react";

import { collectionLabel, displayDate } from "@/components/admin/canonical-subscription/format";
import { CalendarIcon, CardIcon, DocumentIcon, LayersIcon } from "@/components/admin/canonical-subscription/icons";
import { daysUntil } from "@/lib/domain/canonical-service-presentation";

function renewalNote(nextBillingDate: Date | null): string {
  if (!nextBillingDate) return "No renewal date";
  const days = daysUntil(nextBillingDate);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${days} days`;
  return days === -1 ? "1 day ago" : `${-days} days ago`;
}

function Cell({ icon, label, children, note }: { icon: ReactNode; label: string; children: ReactNode; note: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 bg-white p-4 dark:bg-zinc-900">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="mt-0.5 break-words text-lg font-semibold leading-tight tabular-nums">{children}</dd>
        <dd className="mt-0.5 break-words text-xs text-zinc-500">{note}</dd>
      </div>
    </div>
  );
}

/**
 * Subscription-level facts in one compact strip: two columns on phones, one row on desktop. The
 * total here is for this subscription only; each service's own rate is shown on its service screen.
 */
export function SummaryStrip({ total, cycleUnit, serviceCount, nextBillingDate, collectionMethod, gracePeriodDays, outstanding, outstandingNote }: {
  total: string;
  cycleUnit: string;
  serviceCount: number;
  nextBillingDate: Date | null;
  collectionMethod: string | null;
  gracePeriodDays: number | null;
  outstanding: string;
  outstandingNote: string;
}) {
  return (
    <section aria-label="Subscription summary" className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <dl className="grid grid-cols-1 gap-px bg-zinc-200 min-[480px]:grid-cols-2 lg:grid-cols-4 dark:bg-zinc-800">
        <Cell icon={<LayersIcon className="size-5" />} label="Subscription total" note={`${serviceCount} billable service${serviceCount === 1 ? "" : "s"}`}>
          {total}<span className="text-sm font-normal text-zinc-500"> / {cycleUnit}</span>
        </Cell>
        <Cell icon={<CalendarIcon className="size-5" />} label="Next renewal" note={renewalNote(nextBillingDate)}>
          {displayDate(nextBillingDate)}
        </Cell>
        <Cell icon={<CardIcon className="size-5" />} label="Billing method" note={collectionMethod === "manual_invoice" ? `Grace ${gracePeriodDays} days` : collectionMethod === "stripe_autocharge" ? "Stripe-managed collection" : "Choose in Billing"}>
          {collectionLabel(collectionMethod)}
        </Cell>
        <Cell icon={<DocumentIcon className="size-5" />} label="Outstanding" note={outstandingNote}>
          {outstanding}
        </Cell>
      </dl>
    </section>
  );
}
