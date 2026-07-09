import { formatMoney } from "@/lib/domain/native-billing";
import { PaymentDeclineEmailPreviewToggle } from "@/components/admin/payment-decline-email-preview";
import { PaymentDeclineResendForm } from "@/components/admin/payment-decline-resend-form";
import type { CustomerPaymentDeclineFollowUp } from "@/lib/stripe/payment-failure-recovery";
import type { PaymentDeclineEmailPreview } from "@/lib/stripe/payment-failure-messaging";

function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CustomerPaymentDeclineFollowUpCard({
  followUp,
  customerId,
  emailPreview,
  whatsAppConfigured,
}: {
  followUp: CustomerPaymentDeclineFollowUp;
  customerId: string;
  emailPreview: PaymentDeclineEmailPreview | null;
  whatsAppConfigured: boolean;
}) {
  const amountLabel = formatMoney(followUp.amount, followUp.currency);
  const declinePart = followUp.declineCode ? ` (${followUp.declineCode})` : "";
  const cardPart = followUp.last4 ? ` · card •••• ${followUp.last4}` : "";
  const invoicePart = followUp.invoiceNumber ? ` · ${followUp.invoiceNumber}` : "";

  const tone = followUp.emailSent
    ? "emerald"
    : followUp.emailError?.includes("no email")
      ? "rose"
      : "amber";

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
    <section
      className={`rounded-lg border p-4 shadow-sm ${borderClass}`}
      aria-label="Payment decline follow-up"
    >
      <h2 className={`text-sm font-semibold ${titleClass}`}>Decline follow-up</h2>
      <p className={`mt-1 text-sm ${bodyClass}`}>
        {amountLabel}
        {declinePart}
        {cardPart}
        {invoicePart}
        {" · "}
        <time dateTime={followUp.occurredAt.toISOString()}>{formatWhen(followUp.occurredAt)}</time>
      </p>

      {followUp.emailSent ? (
        <p className={`mt-2 text-sm ${bodyClass}`}>
          <span className="font-medium">Customer email sent</span>
          {followUp.customerEmail ? (
            <>
              {" "}
              to <span className="font-mono text-xs">{followUp.customerEmail}</span> via your SMTP settings.
            </>
          ) : (
            " via your SMTP settings."
          )}
        </p>
      ) : (
        <p className={`mt-2 text-sm ${bodyClass}`}>
          <span className="font-medium">Customer email not sent</span>
          {followUp.emailError ? <> — {followUp.emailError}</> : "."}
          {!followUp.customerEmail ? (
            <span className="mt-1 block">Add an email on the customer profile, then follow up by phone or WhatsApp.</span>
          ) : null}
        </p>
      )}

      {followUp.whatsAppSent ? (
        <p className={`mt-1 text-sm ${bodyClass}`}>
          <span className="font-medium">Customer WhatsApp sent</span>
          {followUp.customerPhone ? (
            <>
              {" "}
              to <span className="font-mono text-xs">{followUp.customerPhone}</span>.
            </>
          ) : (
            "."
          )}
        </p>
      ) : (
        <p className={`mt-1 text-sm ${bodyClass}`}>
          <span className="font-medium">Customer WhatsApp not sent</span>
          {followUp.whatsAppError ? <> — {followUp.whatsAppError}</> : "."}
        </p>
      )}

      {followUp.smsRecipientCount > 0 ? (
        <p className={`mt-1 text-xs ${bodyClass}`}>
          Staff SMS sent to {followUp.smsRecipientCount} billing alert number
          {followUp.smsRecipientCount === 1 ? "" : "s"}.
        </p>
      ) : null}

      {followUp.payUrl && !followUp.payUrl.includes("/admin/") ? (
        <p className={`mt-2 text-xs ${bodyClass}`}>
          Pay link included in the decline email:{" "}
          <a
            href={followUp.payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            open customer pay page
          </a>
        </p>
      ) : null}

      {emailPreview ? <PaymentDeclineEmailPreviewToggle preview={emailPreview} /> : null}

      <PaymentDeclineResendForm
        customerId={customerId}
        customerEmail={followUp.customerEmail}
        customerPhone={followUp.customerPhone}
        hasPayUrl={Boolean(followUp.payUrl && !followUp.payUrl.includes("/admin/"))}
        whatsAppConfigured={whatsAppConfigured}
        emailAlreadySent={followUp.emailSent}
        whatsAppAlreadySent={followUp.whatsAppSent}
      />
    </section>
  );
}
