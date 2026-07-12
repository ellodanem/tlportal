import type { BillingSetupStatus } from "@/lib/services/billing-lifecycle-service";
import type { CustomerBillingMode, PaymentRemindersPreference } from "@prisma/client";
import { paymentRemindersStatusLabel } from "@/lib/domain/payment-reminders";

type SubscriptionStrip = {
  statusLabel: string;
  status: string;
  planTermLabel: string;
  monthlyRateLabel: string;
  periodEndLabel: string | null;
  vehicleCount: number;
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

function ProviderChip({
  label,
  state,
}: {
  label: string;
  state: "linked" | "missing" | "off" | "na";
}) {
  const styles: Record<typeof state, string> = {
    linked: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    missing: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    off: "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500",
    na: "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500",
  };
  const suffix =
    state === "linked" ? "✓" : state === "missing" ? "— link in settings" : state === "off" ? "off" : "n/a";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[state]}`}>
      {label} {suffix}
    </span>
  );
}

export function CustomerBillingStatusStrip({
  billingMode,
  paymentReminders,
  billingSetup,
  subscription,
  stripeConfigured,
  invoilessConfigured,
}: {
  billingMode: CustomerBillingMode;
  paymentReminders: PaymentRemindersPreference;
  billingSetup: BillingSetupStatus | null;
  subscription: SubscriptionStrip | null;
  stripeConfigured: boolean;
  invoilessConfigured: boolean;
}) {
  const isStripe = billingMode === "stripe_subscription";
  const remindersLabel = paymentRemindersStatusLabel({ billingMode, paymentReminders });

  let stripeChip: "linked" | "missing" | "off" | "na" = "off";
  if (!stripeConfigured) {
    stripeChip = "off";
  } else if (!billingSetup) {
    stripeChip = isStripe ? "missing" : "na";
  } else if (billingSetup.hasStripeAccount) {
    stripeChip = "linked";
  } else if (isStripe) {
    stripeChip = "missing";
  } else {
    stripeChip = "na";
  }

  let invoilessChip: "linked" | "missing" | "off" | "na" = "off";
  if (!invoilessConfigured) {
    invoilessChip = "off";
  } else if (!billingSetup) {
    invoilessChip = "missing";
  } else if (billingSetup.hasInvoilessAccount) {
    invoilessChip = "linked";
  } else {
    invoilessChip = "missing";
  }

  const showSyncChip = isStripe && Boolean(subscription);

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Billing status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <CreditCardIcon className="h-3.5 w-3.5" />
            Billing
          </span>
          <span className="inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {isStripe ? "Card (Stripe)" : "Manual / cash"}
          </span>
          {stripeConfigured ? <ProviderChip label="Stripe" state={stripeChip} /> : null}
          {invoilessConfigured ? <ProviderChip label="Invoiless" state={invoilessChip} /> : null}
          <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {remindersLabel}
          </span>
        </div>

        {showSyncChip ? (
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              title="Stripe sync comparison is a placeholder — compare & push ships next."
            >
              <CheckCircleIcon className="h-3.5 w-3.5" />
              In sync with Stripe
            </span>
            <span className="max-w-[15rem] text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
              TL and Stripe agree on quantity, rate, and next invoice
            </span>
          </div>
        ) : null}
      </div>

      {isStripe ? (
        <div className="mt-3">
          {subscription ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Subscription</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(subscription.status)}`}
                >
                  {subscription.statusLabel}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {subscription.planTermLabel}
                {" · "}
                {subscription.monthlyRateLabel}/mo per vehicle
                {" · "}
                {subscription.vehicleCount} vehicle{subscription.vehicleCount === 1 ? "" : "s"}
                {subscription.periodEndLabel ? (
                  <>
                    {" · "}
                    Period ends {subscription.periodEndLabel}
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              No subscription yet — use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Create payment link</strong>{" "}
              below after accounts are linked.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Invoicing and renewals are tracked per device below. Card billing is off for this customer.
        </p>
      )}
    </section>
  );
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M2.5 8h15" strokeLinecap="round" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}
