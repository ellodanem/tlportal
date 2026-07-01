import { formatMoney } from "@/lib/domain/native-billing";
import { paymentFailureEmailFollowUpLabel } from "@/lib/stripe/payment-failure-recovery";

export type ActivityEventRow = {
  id: string;
  category: string;
  summary: string;
  payload: unknown;
  occurredAt: Date;
};

type ChipTone = "rose" | "amber" | "emerald" | "zinc";

function chipClass(tone: ChipTone): string {
  switch (tone) {
    case "rose":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200";
    case "amber":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
    case "emerald":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function ActivityChip({ label, tone = "zinc" }: { label: string; tone?: ChipTone }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${chipClass(tone)}`}>
      {label}
    </span>
  );
}

function PaymentFailedActivity({ event }: { event: ActivityEventRow }) {
  const payload = event.payload as {
    amount?: number;
    currency?: string;
    declineCode?: string | null;
    last4?: string | null;
    invoiceNumber?: string | null;
    emailSent?: boolean;
    emailError?: string | null;
    smsRecipientCount?: number;
  } | null;

  const amount = payload?.amount ?? 0;
  const currency = payload?.currency ?? "XCD";
  const title =
    amount > 0
      ? `Payment declined — ${formatMoney(amount, currency)}`
      : "Payment declined";

  const emailLabel = paymentFailureEmailFollowUpLabel({
    emailSent: payload?.emailSent === true,
    emailError: payload?.emailError ?? null,
  });
  const emailTone: ChipTone = payload?.emailSent
    ? "emerald"
    : payload?.emailError?.toLowerCase().includes("no email")
      ? "rose"
      : "amber";

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <ActivityChip label="Declined" tone="rose" />
        {payload?.declineCode ? <ActivityChip label={payload.declineCode} tone="rose" /> : null}
        {payload?.last4 ? <ActivityChip label={`•••• ${payload.last4}`} /> : null}
        {payload?.invoiceNumber ? <ActivityChip label={payload.invoiceNumber} /> : null}
        <ActivityChip label={emailLabel} tone={emailTone} />
        {(payload?.smsRecipientCount ?? 0) > 0 ? (
          <ActivityChip
            label={`${payload!.smsRecipientCount} staff SMS`}
            tone="zinc"
          />
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">billing · payment failed</p>
    </div>
  );
}

export function CustomerActivityEvent({ event }: { event: ActivityEventRow }) {
  if (event.category === "billing.payment_failed") {
    return <PaymentFailedActivity event={event} />;
  }

  return (
    <div className="min-w-0">
      <p className="text-sm text-zinc-800 dark:text-zinc-200">{event.summary}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{event.category.replace(/\./g, " · ")}</p>
    </div>
  );
}

export function CustomerActivityEventTime({ occurredAt }: { occurredAt: Date }) {
  return (
    <time
      dateTime={occurredAt.toISOString()}
      className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400"
    >
      {occurredAt.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </time>
  );
}
