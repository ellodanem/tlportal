"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  resendPaymentDeclineEmailAction,
  resendPaymentDeclineWhatsAppAction,
  type ResendPaymentDeclineEmailState,
  type ResendPaymentDeclineWhatsAppState,
} from "@/app/admin/customers/billing-actions";

const emailInitial: ResendPaymentDeclineEmailState = { error: null };
const whatsAppInitial: ResendPaymentDeclineWhatsAppState = { error: null };

function ResendButton({ canSend, idleLabel }: { canSend: boolean; idleLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !canSend}
      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
    >
      {pending ? "Sending…" : idleLabel}
    </button>
  );
}

export function PaymentDeclineResendForm({
  customerId,
  customerEmail,
  customerPhone,
  hasPayUrl,
  whatsAppConfigured,
  emailAlreadySent,
  whatsAppAlreadySent,
}: {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  hasPayUrl: boolean;
  whatsAppConfigured: boolean;
  emailAlreadySent: boolean;
  whatsAppAlreadySent: boolean;
}) {
  const router = useRouter();
  const [emailState, emailAction] = useActionState(resendPaymentDeclineEmailAction, emailInitial);
  const [whatsAppState, whatsAppAction] = useActionState(resendPaymentDeclineWhatsAppAction, whatsAppInitial);

  const canSendEmail = Boolean(customerEmail?.trim()) && hasPayUrl;
  const canSendWhatsApp = Boolean(customerPhone?.trim()) && hasPayUrl && whatsAppConfigured;

  useEffect(() => {
    if (emailState.ok || whatsAppState.ok) router.refresh();
  }, [emailState.ok, whatsAppState.ok, router]);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={emailAction}>
          <input type="hidden" name="customerId" value={customerId} />
          <ResendButton canSend={canSendEmail} idleLabel="Resend decline email" />
        </form>
        <form action={whatsAppAction}>
          <input type="hidden" name="customerId" value={customerId} />
          <ResendButton canSend={canSendWhatsApp} idleLabel="Resend WhatsApp" />
        </form>
        {emailAlreadySent || whatsAppAlreadySent ? (
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Sends the same decline follow-up message again.
          </span>
        ) : null}
      </div>

      {!customerEmail?.trim() ? (
        <p className="text-xs text-rose-700 dark:text-rose-300">
          Add a customer email on the profile to resend by email.
        </p>
      ) : null}
      {!customerPhone?.trim() ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Add a customer phone on the profile to resend by WhatsApp.
        </p>
      ) : customerPhone && !whatsAppConfigured ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">WhatsApp is not configured.</p>
      ) : null}
      {(customerEmail || customerPhone) && !hasPayUrl ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">No pay link is stored for this decline.</p>
      ) : null}

      {emailState.error ? (
        <p className="text-sm text-rose-700 dark:text-rose-400" role="alert">
          {emailState.error}
        </p>
      ) : null}
      {emailState.ok && emailState.message ? (
        <p className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
          {emailState.message}
        </p>
      ) : null}
      {whatsAppState.error ? (
        <p className="text-sm text-rose-700 dark:text-rose-400" role="alert">
          {whatsAppState.error}
        </p>
      ) : null}
      {whatsAppState.ok && whatsAppState.message ? (
        <p className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
          {whatsAppState.message}
        </p>
      ) : null}
    </div>
  );
}
