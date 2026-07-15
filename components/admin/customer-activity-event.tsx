import { formatMoney } from "@/lib/domain/native-billing";
import {
  paymentFailureEmailFollowUpLabel,
  paymentFailureWhatsAppFollowUpLabel,
} from "@/lib/stripe/payment-failure-recovery";

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
    whatsAppSent?: boolean;
    whatsAppError?: string | null;
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

  const whatsAppLabel = paymentFailureWhatsAppFollowUpLabel({
    whatsAppSent: payload?.whatsAppSent === true,
    whatsAppError: payload?.whatsAppError ?? null,
  });
  const whatsAppTone: ChipTone = payload?.whatsAppSent ? "emerald" : payload?.whatsAppError ? "amber" : "zinc";

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <ActivityChip label="Declined" tone="rose" />
        {payload?.declineCode ? <ActivityChip label={payload.declineCode} tone="rose" /> : null}
        {payload?.last4 ? <ActivityChip label={`•••• ${payload.last4}`} /> : null}
        {payload?.invoiceNumber ? <ActivityChip label={payload.invoiceNumber} /> : null}
        <ActivityChip label={emailLabel} tone={emailTone} />
        <ActivityChip label={whatsAppLabel} tone={whatsAppTone} />
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

function PaymentDeclineEmailResentActivity({ event }: { event: ActivityEventRow }) {
  const payload = event.payload as { amount?: number; currency?: string; invoiceNumber?: string | null } | null;
  const amount =
    payload?.amount != null && payload.amount > 0
      ? formatMoney(payload.amount, payload?.currency ?? "XCD")
      : null;

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{event.summary}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <ActivityChip label="Decline email resent" tone="emerald" />
        {amount ? <ActivityChip label={amount} /> : null}
        {payload?.invoiceNumber ? <ActivityChip label={payload.invoiceNumber} /> : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">billing · payment decline email resent</p>
    </div>
  );
}

function PaymentDeclineWhatsAppResentActivity({ event }: { event: ActivityEventRow }) {
  const payload = event.payload as { amount?: number; currency?: string; invoiceNumber?: string | null } | null;
  const amount =
    payload?.amount != null && payload.amount > 0
      ? formatMoney(payload.amount, payload?.currency ?? "XCD")
      : null;

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{event.summary}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <ActivityChip label="Decline WhatsApp resent" tone="emerald" />
        {amount ? <ActivityChip label={amount} /> : null}
        {payload?.invoiceNumber ? <ActivityChip label={payload.invoiceNumber} /> : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">billing · payment decline WhatsApp resent</p>
    </div>
  );
}

function PaymentLinkSentActivity({ event }: { event: ActivityEventRow }) {
  const payload = event.payload as {
    channels?: { email?: boolean; whatsapp?: boolean };
    emailTo?: string | null;
    whatsappTo?: string | null;
    emailError?: string | null;
    whatsappError?: string | null;
  } | null;

  const emailSent = payload?.channels?.email === true;
  const whatsAppSent = payload?.channels?.whatsapp === true;
  const emailTone: ChipTone = emailSent ? "emerald" : payload?.emailError ? "amber" : "zinc";
  const whatsAppTone: ChipTone = whatsAppSent ? "emerald" : payload?.whatsappError ? "amber" : "zinc";

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Payment link sent to customer</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <ActivityChip
          label={emailSent ? "Email accepted" : payload?.emailError ? "Email failed" : "Email not sent"}
          tone={emailTone}
        />
        <ActivityChip
          label={whatsAppSent ? "WhatsApp accepted" : payload?.whatsappError ? "WhatsApp failed" : "WhatsApp not sent"}
          tone={whatsAppTone}
        />
        {payload?.emailTo ? <ActivityChip label={payload.emailTo} /> : null}
        {payload?.whatsappTo ? <ActivityChip label={payload.whatsappTo} /> : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">billing · payment link sent</p>
    </div>
  );
}

function CommunicationMessageSentActivity({ event }: { event: ActivityEventRow }) {
  const payload = event.payload as {
    channel?: string;
    to?: string | null;
    kind?: string | null;
    templateKind?: string | null;
    messageSid?: string | null;
  } | null;

  const channel = payload?.channel === "email" ? "Email" : payload?.channel === "whatsapp" ? "WhatsApp" : "Message";
  const kindLabel =
    payload?.kind === "stripe_checkout"
      ? "Checkout payment link"
      : payload?.templateKind
        ? payload.templateKind
        : null;

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{event.summary}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <ActivityChip label={`${channel} accepted`} tone="emerald" />
        {kindLabel ? <ActivityChip label={kindLabel} /> : null}
        {payload?.to ? <ActivityChip label={payload.to} /> : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">communication · message sent</p>
    </div>
  );
}

export function CustomerActivityEvent({ event }: { event: ActivityEventRow }) {
  if (event.category === "billing.payment_failed") {
    return <PaymentFailedActivity event={event} />;
  }
  if (event.category === "billing.payment_decline_email_resent") {
    return <PaymentDeclineEmailResentActivity event={event} />;
  }
  if (event.category === "billing.payment_decline_whatsapp_resent") {
    return <PaymentDeclineWhatsAppResentActivity event={event} />;
  }
  if (event.category === "communication.message_sent") {
    return <CommunicationMessageSentActivity event={event} />;
  }
  if (event.category === "billing" && event.summary === "Payment link sent to customer") {
    return <PaymentLinkSentActivity event={event} />;
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
