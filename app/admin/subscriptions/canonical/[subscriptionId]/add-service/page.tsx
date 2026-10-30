import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SubscriptionAddServiceFlow } from "@/components/admin/subscription-add-service-flow";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { canonicalSubscriptionUiStaffViewer } from "@/lib/services/canonical-subscription-admin-service";
import { getServiceAdditionContext } from "@/lib/services/subscription-service-addition-service";

export const dynamic = "force-dynamic";

export default async function AddServicePage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  if (!canonicalSubscriptionUiVisible()) notFound();
  if (!await canonicalSubscriptionUiStaffViewer()) redirect("/login");
  const { subscriptionId } = await params;
  const context = await getServiceAdditionContext(subscriptionId);
  if (!context) notFound();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <Link href={`/admin/subscriptions/canonical/${subscriptionId}`} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← {context.subscription.customerLabel}</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Add a service</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Three short steps. The price, billing cycle and renewal come from the subscription; you only confirm what is new.</p>
      </div>
      <SubscriptionAddServiceFlow context={context} creationKey={randomUUID()} today={today} />
    </div>
  );
}
