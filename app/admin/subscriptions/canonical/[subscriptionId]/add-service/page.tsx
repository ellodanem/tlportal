import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { AddCanonicalDraftItemForm } from "@/components/admin/canonical-subscription-draft-forms";
import { SubscriptionAddServiceFlow } from "@/components/admin/subscription-add-service-flow";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";
import { subscriptionBasePath } from "@/lib/domain/canonical-subscription-navigation";
import { getServiceAdditionContext } from "@/lib/services/subscription-service-addition-service";

export const dynamic = "force-dynamic";

/**
 * The single entry point for adding a service. Draft subscriptions get the draft form inline
 * (their services are not billed yet); live subscriptions get the guided three-step flow.
 */
export default async function AddServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ subscriptionId: string }>;
  searchParams: Promise<{ assignmentId?: string }>;
}) {
  const { subscriptionId } = await params;
  const { assignmentId } = await searchParams;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);
  const back = (
    <Link href={subscriptionBasePath(subscriptionId)} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">← {subscription.customerLabel}</Link>
  );

  if (subscription.lifecycleStatus === "draft" && permissions.editable) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div>
          {back}
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Add a service</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">This subscription is still a draft, so the service is added to the setup checklist and nothing is invoiced until you activate it.</p>
        </div>
        <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <AddCanonicalDraftItemForm subscriptionId={subscription.id} nextBillingDate={subscription.nextBillingDate?.toISOString().slice(0, 10) ?? ""} defaultAmount={subscription.agreedAmountPerCycle?.toString() ?? "0.00"} />
        </section>
      </div>
    );
  }

  const context = await getServiceAdditionContext(subscriptionId);
  if (!context) notFound();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        {back}
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Add a service</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Three short steps. The price, billing cycle and renewal come from the subscription; you only confirm what is new.</p>
      </div>
      <SubscriptionAddServiceFlow context={context} creationKey={randomUUID()} today={today} initialAssignmentId={assignmentId} />
    </div>
  );
}
