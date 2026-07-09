import { formatMoney } from "@/lib/domain/native-billing";
import {
  paymentFailureEmailFollowUpLabel,
  paymentFailureWhatsAppFollowUpLabel,
  type NativeInvoiceDeclineFollowUp,
} from "@/lib/stripe/payment-failure-recovery";

function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InvoiceDeclineFollowUpBanner({ followUp }: { followUp: NativeInvoiceDeclineFollowUp }) {
  const amountLabel = formatMoney(followUp.amount, followUp.currency);
  const declinePart = followUp.declineCode ? ` (${followUp.declineCode})` : "";
  const cardPart = followUp.last4 ? ` · •••• ${followUp.last4}` : "";
  const emailLabel = paymentFailureEmailFollowUpLabel({
    emailSent: followUp.emailSent,
    emailError: followUp.emailError,
  });
  const whatsAppLabel = paymentFailureWhatsAppFollowUpLabel({
    whatsAppSent: followUp.whatsAppSent,
    whatsAppError: followUp.whatsAppError,
  });

  const tone = followUp.emailSent ? "emerald" : followUp.emailError?.includes("no email") ? "rose" : "amber";

  const borderClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/30"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/30"
        : "border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30";

  const titleClass =
    tone === "emerald"
      ? "text-emerald-950 dark:text-emerald-100"
      : tone === "rose"
        ? "text-rose-950 dark:text-rose-100"
        : "text-amber-950 dark:text-amber-100";

  const bodyClass =
    tone === "emerald"
      ? "text-emerald-900/90 dark:text-emerald-200/90"
      : tone === "rose"
        ? "text-rose-900/90 dark:text-rose-200/90"
        : "text-amber-900/90 dark:text-amber-200/90";

  return (
    <div className={`rounded-xl border p-4 text-sm ${borderClass}`}>
      <p className={`font-medium ${titleClass}`}>Decline follow-up</p>
      <p className={`mt-1 ${bodyClass}`}>
        Card payment declined {amountLabel}
        {declinePart}
        {cardPart} on{" "}
        <time dateTime={followUp.occurredAt.toISOString()}>{formatWhen(followUp.occurredAt)}</time>.
      </p>
      <p className={`mt-1 ${bodyClass}`}>
        <span className="font-medium">{emailLabel}</span>
        {followUp.emailSent
          ? " — customer decline email delivered via SMTP."
          : followUp.emailError
            ? ` — ${followUp.emailError}`
            : " — follow up manually."}
      </p>
      <p className={`mt-1 ${bodyClass}`}>
        <span className="font-medium">{whatsAppLabel}</span>
        {followUp.whatsAppSent
          ? " — customer decline WhatsApp delivered."
          : followUp.whatsAppError
            ? ` — ${followUp.whatsAppError}`
            : " — follow up manually."}
      </p>
      {followUp.smsRecipientCount > 0 ? (
        <p className={`mt-1 text-xs ${bodyClass}`}>
          Staff SMS sent to {followUp.smsRecipientCount} billing alert number
          {followUp.smsRecipientCount === 1 ? "" : "s"}.
        </p>
      ) : null}
    </div>
  );
}
