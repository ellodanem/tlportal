"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type AutoReceiptEmailFormState,
  updateAutoEmailPaidStripeReceipts,
} from "@/app/admin/settings/actions";

const initialState: AutoReceiptEmailFormState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
    >
      {pending ? "Saving…" : "Save receipt email setting"}
    </button>
  );
}

export function AutoReceiptEmailForm({ initialEnabled }: { initialEnabled: boolean }) {
  const [state, formAction] = useActionState(updateAutoEmailPaidStripeReceipts, initialState);

  return (
    <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-white via-white to-emerald-50/40 p-6 shadow-sm dark:border-emerald-900/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-emerald-950/25">
      <div className="flex flex-col gap-2 border-b border-emerald-100/80 pb-4 dark:border-emerald-900/50">
        <h2 className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">Paid receipt emails</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          When a Stripe subscription charge succeeds, TL Portal generates a TL-branded paid receipt PDF (
          <code className="text-xs">TL-INV-…</code>). With this enabled, that PDF is emailed automatically to the
          customer (and invoice Cc/Bcc on their profile). Requires SMTP above. Staff can still resend manually from
          the Billing tab.
        </p>
      </div>

      <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-4">
        <label className="flex items-start gap-3 text-sm text-zinc-800 dark:text-zinc-200">
          <input
            type="checkbox"
            name="autoEmailPaidStripeReceipts"
            defaultChecked={initialEnabled}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-500 dark:border-zinc-600"
          />
          <span>
            <span className="font-medium">Email paid receipt automatically</span>
            <span className="mt-1 block text-zinc-600 dark:text-zinc-400">
              Applies to initial Checkout payments and subscription renewals when webhooks run.
            </span>
          </span>
        </label>

        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">Saved.</p>
        ) : null}

        <SaveButton />
      </form>
    </div>
  );
}
