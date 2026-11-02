import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerWorkspaceTabs } from "@/components/admin/customer-workspace-tabs";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerNewHref } from "@/lib/admin/customer-new";
import { canonicalSubscriptionLinks } from "@/lib/admin/customer-subscription-links";
import { prisma } from "@/lib/db";
import { HIDE_EMPTY_RETIRED_SUBSCRIPTIONS } from "@/lib/domain/canonical-subscription-merge";

type Props = {
  children: React.ReactNode;
  params: Promise<{ customerId: string }>;
};

/**
 * Shared frame for the customer workspace in Subscriptions: who the customer is, their
 * subscriptions, and the Billing / Statements / Messages / Activity tabs. Each tab page is a
 * real route, so every section is directly linkable.
 */
export default async function CustomerWorkspaceLayout({ children, params }: Props) {
  const { customerId } = await params;
  const [customer, subscriptionRows] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, company: true, firstName: true, lastName: true } }),
    prisma.customerSubscription.findMany({
      where: { customerId, ...HIDE_EMPTY_RETIRED_SUBSCRIPTIONS },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, billingIntervalMonths: true, lifecycleStatus: true, nextBillingDate: true },
    }),
  ]);
  if (!customer) notFound();

  const title = customerDisplayName(customer);
  const subscriptionLinks = canonicalSubscriptionLinks(subscriptionRows);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <header className="rounded-2xl border border-zinc-200 bg-white px-4 pt-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
              <Link href="/admin/subscriptions" className="hover:underline">Subscriptions</Link>
              <span aria-hidden="true"> / </span>
              <span>Customer</span>
            </nav>
            <h1 className="mt-1 truncate text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Billing, statements, messages and activity across all of this customer&apos;s subscriptions.</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link href={customerNewHref({ c: customer.id })} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800">View customer →</Link>
          </div>
        </div>
        {subscriptionLinks.length ? (
          <nav aria-label="Subscriptions for this customer" className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Subscriptions</span>
            {subscriptionLinks.map((entry) => (
              <Link key={entry.id} href={`/admin/subscriptions/canonical/${entry.id}`} className="inline-flex min-h-9 items-center rounded-full border border-zinc-300 px-3 py-1 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800">
                {entry.label}
                <span className="ml-1.5 text-xs font-normal text-zinc-500">{entry.interval}</span>
              </Link>
            ))}
          </nav>
        ) : null}
        <CustomerWorkspaceTabs customerId={customer.id} />
      </header>
      {children}
    </div>
  );
}
