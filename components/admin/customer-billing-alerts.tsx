import type { CustomerBillingMode } from "@prisma/client";

export function CustomerBillingAlerts({
  billingMode,
  setupBanner,
  setupWarning,
  stripeBanner,
}: {
  billingMode: CustomerBillingMode;
  setupBanner: boolean;
  setupWarning: string | null;
  stripeBanner: "success" | "cancel" | null;
}) {
  const isStripe = billingMode === "stripe_subscription";
  const hasAlerts = setupBanner || setupWarning || stripeBanner;

  if (!hasAlerts) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      {setupBanner ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {isStripe ? (
            <>
              Accounts linked — no Checkout started. Send a <strong>payment link</strong> when the customer is ready to pay by card.
            </>
          ) : (
            <>
              Invoiless linked for manual billing. Issue invoices in Invoiless or switch to Stripe in{" "}
              <strong>billing settings</strong> below.
            </>
          )}
        </p>
      ) : null}
      {setupWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="font-medium">Setup note: </span>
          {setupWarning}
        </p>
      ) : null}
      {stripeBanner === "success" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          Checkout completed — subscription status updates after webhooks (usually within seconds).
        </p>
      ) : null}
      {stripeBanner === "cancel" ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Checkout was canceled.
        </p>
      ) : null}
    </div>
  );
}
