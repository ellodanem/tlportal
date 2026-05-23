import Link from "next/link";

import { CUSTOMER_SUBSCRIPTION_STATUS_LABEL } from "@/lib/domain/customer-subscription";
import type { CustomerBillingMode } from "@prisma/client";

function formatDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function CustomerOverviewBillingRibbon({
  customerId,
  billingMode,
  subscriptionStatusLabel,
  invoilessLinked,
  invoilessCustomerId,
  nextDue,
}: {
  customerId: string;
  billingMode: CustomerBillingMode;
  subscriptionStatusLabel: string;
  invoilessLinked: boolean;
  invoilessCustomerId: string | null;
  nextDue: Date | null | undefined;
}) {
  const billingHref = `/admin/customers/${customerId}/billing`;
  const modeLabel = billingMode === "stripe_subscription" ? "Card (Stripe)" : "Manual / cash";

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Billing summary"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="flex min-w-0 flex-wrap items-baseline gap-x-8 gap-y-3 text-sm sm:gap-x-12">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Billing mode
            </dt>
            <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">{modeLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Subscription
            </dt>
            <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">{subscriptionStatusLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Invoiless
            </dt>
            <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">
              {invoilessLinked ? "Linked" : "Not linked"}
              {invoilessLinked && invoilessCustomerId ? (
                <span className="ml-1.5 font-mono text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  {invoilessCustomerId}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Next due
            </dt>
            <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">{formatDate(nextDue)}</dd>
          </div>
        </dl>
        <Link
          href={billingHref}
          className="inline-flex shrink-0 items-center justify-center text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Manage billing →
        </Link>
      </div>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Earliest next billing date across open services · full billing on the Billing tab
      </p>
    </section>
  );
}

export function subscriptionStatusLabelForOverview(
  billingMode: CustomerBillingMode,
  subscription: { status: keyof typeof CUSTOMER_SUBSCRIPTION_STATUS_LABEL } | null,
  stripeAccountStatus: string | null | undefined,
): string {
  if (billingMode !== "stripe_subscription") {
    return "Manual";
  }
  if (subscription) {
    return CUSTOMER_SUBSCRIPTION_STATUS_LABEL[subscription.status];
  }
  return stripeAccountStatus ?? "Not started";
}
