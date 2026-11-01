import { SubscriptionHeader } from "@/components/admin/canonical-subscription/subscription-header";
import { requireSubscriptionPage } from "@/lib/admin/canonical-subscription-page-data";

type Props = {
  children: React.ReactNode;
  params: Promise<{ subscriptionId: string }>;
};

/**
 * Shared frame for the subscription's real-route sections. Each section page repeats the
 * access check because layouts are not re-rendered when moving between sibling routes.
 */
export default async function SubscriptionTabsLayout({ children, params }: Props) {
  const { subscriptionId } = await params;
  const { subscription, permissions } = await requireSubscriptionPage(subscriptionId);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 text-zinc-950 dark:text-zinc-50">
      <SubscriptionHeader subscription={subscription} permissions={permissions} />
      {children}
    </div>
  );
}
