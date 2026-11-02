import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeftIcon } from "@/components/admin/canonical-subscription/icons";
import { ServiceFullHistory } from "@/components/admin/canonical-subscription/service-history";
import { loadServiceHistory, requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";
import { subscriptionServicePath } from "@/lib/domain/canonical-subscription-navigation";

type Props = { params: Promise<{ subscriptionId: string; itemId: string }> };

/** Complete read-only history for one service; the service screen shows only the latest few events. */
export default async function CanonicalServiceHistoryPage({ params }: Props) {
  const { subscriptionId, itemId } = await params;
  const { subscription } = await requireSubscriptionPage(subscriptionId);
  const index = subscription.items.findIndex((candidate) => candidate.id === itemId);
  // The service must belong to this subscription; another agreement's service id is never shown here.
  if (index < 0) notFound();
  const item = subscription.items[index];
  const label = item.label?.trim() || `Service ${index + 1}`;
  const rows = await loadServiceHistory(item);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href={subscriptionServicePath(subscription.id, item.id)} aria-label={`Back to ${label}`} title={label} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
          <ArrowLeftIcon />
        </Link>
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold tracking-tight">Service history</h2>
          <p className="text-sm text-zinc-500">{label}</p>
        </div>
      </div>
      <ServiceFullHistory item={item} rows={rows} />
    </div>
  );
}
