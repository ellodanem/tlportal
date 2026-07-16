"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  setPaymentRemindersAction,
  type BillingActionState,
} from "@/app/admin/customers/billing-actions";
import type { PaymentRemindersPreference } from "@prisma/client";
import { customerReceivesPaymentReminders } from "@/lib/domain/payment-reminders";
import type { CustomerBillingMode } from "@prisma/client";

const initial: BillingActionState = { error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function PaymentRemindersPreferenceForm({
  customerId,
  billingMode,
  paymentReminders,
}: {
  customerId: string;
  billingMode: CustomerBillingMode;
  paymentReminders: PaymentRemindersPreference;
}) {
  const [state, action] = useActionState(setPaymentRemindersAction, initial);
  const effective = customerReceivesPaymentReminders({ billingMode, paymentReminders });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Scheduled due/overdue nudges (WhatsApp today; same setting for all channels). Stripe card failures use the
        decline follow-up series instead — Auto keeps reminders off for Stripe customers.
      </p>

      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <input type="hidden" name="customerId" value={customerId} />
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="paymentReminders">
            Preference
          </label>
          <select
            id="paymentReminders"
            name="paymentReminders"
            defaultValue={paymentReminders}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            <option value="auto">Auto (manual on, Stripe off)</option>
            <option value="on">On (always send)</option>
            <option value="off">Off (never send)</option>
          </select>
        </div>
        <SaveButton />
      </form>

      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        Effective now:{" "}
        <span className="font-medium text-zinc-800 dark:text-zinc-200">
          {effective ? "will receive reminders" : "will not receive reminders"}
        </span>
        {billingMode === "stripe_subscription" && paymentReminders === "auto"
          ? " (Stripe + Auto)."
          : "."}
      </p>

      {state.error ? (
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-400" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
