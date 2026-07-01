"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  resendPaymentDeclineEmailAction,
  type ResendPaymentDeclineEmailState,
} from "@/app/admin/customers/billing-actions";

const initial: ResendPaymentDeclineEmailState = { error: null };

function ResendButton({ canSend }: { canSend: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !canSend}
      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
    >
      {pending ? "Sending…" : "Resend decline email"}
    </button>
  );
}

export function PaymentDeclineResendForm({
  customerId,
  customerEmail,
  hasPayUrl,
  emailAlreadySent,
}: {
  customerId: string;
  customerEmail: string | null;
  hasPayUrl: boolean;
  emailAlreadySent: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(resendPaymentDeclineEmailAction, initial);
  const canSend = Boolean(customerEmail?.trim()) && hasPayUrl;

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="flex flex-wrap items-center gap-2">
        <ResendButton canSend={canSend} />
        {emailAlreadySent ? (
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Sends the same decline follow-up message again.
          </span>
        ) : null}
      </div>
      {!customerEmail?.trim() ? (
        <p className="text-xs text-rose-700 dark:text-rose-300">
          Add a customer email on the profile before resending.
        </p>
      ) : null}
      {customerEmail && !hasPayUrl ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">No pay link is stored for this decline.</p>
      ) : null}
      {state.error ? (
        <p className="text-sm text-rose-700 dark:text-rose-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
