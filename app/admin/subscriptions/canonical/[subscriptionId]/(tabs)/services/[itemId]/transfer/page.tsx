import Link from "next/link";
import { notFound } from "next/navigation";

import { TransferToCustomerForm } from "@/components/admin/canonical-subscription-transfer-to-customer-form";
import { loadTransferToCustomerPageData, requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";
import { subscriptionServicePath } from "@/lib/domain/canonical-subscription-navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ subscriptionId: string; itemId: string }> };

export default async function TransferServiceToCustomerPage({ params }: Props) {
  const { subscriptionId, itemId } = await params;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  const item = subscription.items.find((candidate) => candidate.id === itemId);
  if (!item) notFound();
  const back = subscriptionServicePath(subscriptionId, itemId);
  if (!permissions.canManage || ["ended", "canceled"].includes(item.status) || item.successorItem) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Link href={back} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← Back to service</Link>
        <p role="status" className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          This service cannot be transferred to another customer.
        </p>
      </div>
    );
  }
  const data = await loadTransferToCustomerPageData(subscription, item);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <Link href={back} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← {data.serviceLabel}</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Transfer to another customer</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Move this vehicle onto a different customer. The rest of this agreement stays put.</p>
      </div>
      <TransferToCustomerForm data={data} />
    </div>
  );
}
