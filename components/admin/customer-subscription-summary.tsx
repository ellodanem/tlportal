type SubscriptionSummaryProps = {
  statusLabel: string;
  status: string;
  planTermLabel: string;
  monthlyRateLabel: string;
  periodEndLabel: string | null;
  vehicleCount: number;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
};

function statusClass(status: string): string {
  switch (status) {
    case "active":
    case "trialing":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "pending_payment":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200";
    case "past_due":
    case "unpaid":
      return "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200";
    case "canceled":
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
    default:
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200";
  }
}

export function CustomerSubscriptionSummary({
  statusLabel,
  status,
  planTermLabel,
  monthlyRateLabel,
  periodEndLabel,
  vehicleCount,
  stripeSubscriptionId,
  stripeCustomerId,
}: SubscriptionSummaryProps) {
  return (
    <section className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Subscription</h3>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        TL Portal record — updated from Stripe webhooks after payment.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-700 dark:text-zinc-300">Plan</dt>
          <dd className="text-zinc-600 dark:text-zinc-400">{planTermLabel}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-700 dark:text-zinc-300">Monthly rate</dt>
          <dd className="text-zinc-600 dark:text-zinc-400">{monthlyRateLabel}/month</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-700 dark:text-zinc-300">Vehicles / devices</dt>
          <dd className="text-zinc-600 dark:text-zinc-400">{vehicleCount}</dd>
        </div>
        {periodEndLabel ? (
          <div>
            <dt className="font-medium text-zinc-700 dark:text-zinc-300">Current period ends</dt>
            <dd className="text-zinc-600 dark:text-zinc-400">{periodEndLabel}</dd>
          </div>
        ) : null}
      </dl>
      {stripeSubscriptionId || stripeCustomerId ? (
        <details className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <summary className="cursor-pointer font-medium text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            Stripe provider details
          </summary>
          <dl className="mt-2 space-y-1 font-mono">
            {stripeSubscriptionId ? (
              <div>
                <dt className="inline text-zinc-500">Subscription: </dt>
                <dd className="inline break-all">{stripeSubscriptionId}</dd>
              </div>
            ) : null}
            {stripeCustomerId ? (
              <div>
                <dt className="inline text-zinc-500">Customer: </dt>
                <dd className="inline break-all">{stripeCustomerId}</dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}
    </section>
  );
}
