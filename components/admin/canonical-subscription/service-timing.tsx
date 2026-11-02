import { displayDate } from "@/components/admin/canonical-subscription/format";
import type { SubscriptionDetail } from "@/lib/admin/canonical-subscription-page-data";

export function ServiceTiming({ item }: { item: SubscriptionDetail["items"][number] }) {
  return (
    <p className="mt-1 text-xs text-zinc-500">
      {item.serviceActivatedDate ? `Started ${displayDate(item.serviceActivatedDate)} · ` : ""}bills from {displayDate(item.billingEffectiveFrom)}{item.billingEffectiveUntil ? ` until ${displayDate(item.billingEffectiveUntil)}` : ""}
      {item.initialAdjustment ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{item.initialAdjustment.invoice ? item.initialAdjustment.invoice.status === "draft" ? "partial period: draft invoice" : "partial period invoiced" : "partial period agreed, not invoiced"}</span> : null}
    </p>
  );
}
