"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { recordPaymentAction, voidInvoiceAction, type RecordPaymentState } from "@/app/admin/tl-invoices/actions";
import { PAYMENT_METHOD_LABELS } from "@/lib/domain/native-billing";
import type { PaymentMethod } from "@prisma/client";

const initialPayment: RecordPaymentState = {};

function PayButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Saving…" : "Record payment"}
    </button>
  );
}

export function InvoicePaymentForm({
  invoiceId,
  amountDue,
  currency,
}: {
  invoiceId: string;
  amountDue: number;
  currency: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(recordPaymentAction, initialPayment);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const methods = (["cash", "cheque", "bank_transfer", "card_manual", "other"] as PaymentMethod[]).map((m) => ({
    value: m,
    label: PAYMENT_METHOD_LABELS[m],
  }));

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-sm font-medium">Record payment</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Cash, cheque, or bank — {currency} {amountDue.toFixed(2)} due.
      </p>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <div>
          <label className="block text-xs font-medium text-zinc-600">Amount</label>
          <input
            name="amount"
            type="number"
            min={0.01}
            step="0.01"
            defaultValue={amountDue.toFixed(2)}
            required
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600">Method</label>
          <select name="method" defaultValue="cash" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950">
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-600">Reference (cheque #, bank ref)</label>
          <input name="reference" type="text" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" />
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <PayButton />
          {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
          {state.ok && state.message ? <p className="text-sm text-emerald-800">{state.message}</p> : null}
        </div>
      </form>
    </div>
  );
}

export function InvoiceVoidForm({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [state, action] = useActionState(voidInvoiceAction, {});

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" className="text-sm font-medium text-red-700 hover:underline dark:text-red-400">
        Void invoice
      </button>
      {state.error ? <p className="mt-1 text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}
