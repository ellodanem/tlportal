"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type BillingAlertPhonesFormState,
  type BillingAlertTestSmsState,
  sendBillingAlertTestSms,
  updateBillingAlertPhones,
} from "@/app/admin/settings/actions";

const initialSaveState: BillingAlertPhonesFormState = {};
const initialTestState: BillingAlertTestSmsState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
    >
      {pending ? "Saving…" : "Save alert numbers"}
    </button>
  );
}

function TestButton({ action }: { action: (formData: FormData) => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={action}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-100 dark:hover:bg-emerald-950/40"
    >
      {pending ? "Sending…" : "Send test SMS"}
    </button>
  );
}

export function BillingAlertPhonesForm({ initialPhones }: { initialPhones: string }) {
  const [state, formAction] = useActionState(updateBillingAlertPhones, initialSaveState);
  const [testState, testFormAction] = useActionState(sendBillingAlertTestSms, initialTestState);

  return (
    <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-white via-white to-emerald-50/40 p-6 shadow-sm dark:border-emerald-900/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-emerald-950/25">
      <div className="flex flex-col gap-2 border-b border-emerald-100/80 pb-4 dark:border-emerald-900/50">
        <h2 className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">Billing alert phones</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          TL Portal sends an <strong>SMS</strong> to these numbers when billing needs staff attention: a customer
          WhatsApp could not be sent (no pay link), or a card payment was declined. One number per line or
          comma-separated. Include country code (e.g. <code className="text-xs">+1758…</code>).
        </p>
      </div>

      <form action={formAction} className="mt-6 flex max-w-xl flex-col gap-4">
        <div>
          <label htmlFor="billingAlertPhones" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Staff SMS numbers
          </label>
          <textarea
            id="billingAlertPhones"
            name="billingAlertPhones"
            rows={4}
            placeholder={"+17585551234\n+17585559876"}
            defaultValue={initialPhones}
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">Saved.</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
          <TestButton action={testFormAction} />
        </div>

        {testState.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {testState.error}
          </p>
        ) : null}
        {testState.ok ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Test SMS sent to {testState.sentCount} number{testState.sentCount === 1 ? "" : "s"}.
          </p>
        ) : null}
      </form>
    </div>
  );
}
