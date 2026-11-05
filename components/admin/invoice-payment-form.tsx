"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  deleteDraftInvoiceAction,
  recordPaymentAction,
  voidInvoiceAction,
  type DeleteInvoiceState,
  type RecordPaymentState,
} from "@/app/admin/tl-invoices/actions";
import { formatMoney, PAYMENT_METHOD_LABELS } from "@/lib/domain/native-billing";
import type { PaymentMethod } from "@prisma/client";

const initialPayment: RecordPaymentState = {};

/** Default for `<input type="date">` (local calendar day). */
function todayDateInputValue(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function PayButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-10 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-60"
    >
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

  const [amountText, setAmountText] = useState(amountDue.toFixed(2));
  // After a (partial) payment the server refreshes `amountDue`; keep the field in sync.
  useEffect(() => {
    setAmountText(amountDue.toFixed(2));
  }, [amountDue]);
  const entered = Number(amountText);
  const validAmount = Number.isFinite(entered) && entered > 0;
  const remaining = validAmount ? Math.round((amountDue - entered) * 100) / 100 : null;

  let outcome: { text: string; tone: "ok" | "info" | "warn" } | null = null;
  if (remaining !== null) {
    if (remaining === 0) outcome = { text: "Invoice will be marked as paid in full.", tone: "ok" };
    else if (remaining > 0) outcome = { text: `Partial payment — ${formatMoney(remaining, currency)} will remain due.`, tone: "info" };
    else outcome = { text: `Exceeds the balance due by ${formatMoney(-remaining, currency)}.`, tone: "warn" };
  }

  const field =
    "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
  const label = "block text-xs font-medium text-zinc-600 dark:text-zinc-400";

  return (
    <section
      id="record-payment"
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800 sm:px-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Record payment</h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Log a cash, cheque, or bank payment received for this invoice.</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Balance due</p>
          <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(amountDue, currency)}</p>
        </div>
      </div>

      <form action={action} className="px-4 py-4 sm:px-5">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="payment-amount" className={label}>Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center pt-1.5 text-xs font-medium text-zinc-500">
                {currency.toUpperCase()}
              </span>
              <input
                id="payment-amount"
                name="amount"
                type="number"
                inputMode="decimal"
                min={0.01}
                step="0.01"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                required
                className={`${field} pl-12 tabular-nums`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="payment-method" className={label}>Method</label>
            <select id="payment-method" name="method" defaultValue="cash" className={field}>
              {methods.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="payment-date" className={label}>Payment date</label>
            <input id="payment-date" name="receivedAt" type="date" defaultValue={todayDateInputValue()} required className={field} />
          </div>
          <div>
            <label htmlFor="payment-reference" className={label}>
              Reference <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input id="payment-reference" name="reference" type="text" placeholder="Cheque # or bank ref" className={field} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm" aria-live="polite">
            {state.error ? (
              <p className="text-red-700 dark:text-red-400">{state.error}</p>
            ) : state.ok && state.message ? (
              <p className="text-emerald-700 dark:text-emerald-400">{state.message}</p>
            ) : outcome ? (
              <p
                className={
                  outcome.tone === "ok"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : outcome.tone === "warn"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-zinc-600 dark:text-zinc-400"
                }
              >
                {outcome.text}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            {amountText !== amountDue.toFixed(2) ? (
              <button
                type="button"
                onClick={() => setAmountText(amountDue.toFixed(2))}
                className="mb-2 min-h-10 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 sm:mb-0 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Reset to full amount
              </button>
            ) : null}
            <PayButton />
          </div>
        </div>
      </form>
    </section>
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


export function InvoiceDeleteForm({ invoiceId, displayNumber }: { invoiceId: string; displayNumber: string }) {
  const router = useRouter();
  const [state, action] = useActionState<DeleteInvoiceState, FormData>(deleteDraftInvoiceAction, {});
  useEffect(() => { if (state.ok) router.push("/admin/tl-invoices"); }, [state.ok, router]);
  return (<form action={action} className="mt-4" onSubmit={(event) => { if (!window.confirm("Delete " + displayNumber + " permanently? This cannot be undone.")) event.preventDefault(); }}>
    <input type="hidden" name="invoiceId" value={invoiceId} />
    <button type="submit" className="text-sm font-medium text-red-700 hover:underline dark:text-red-400">Delete draft invoice</button>
    {state.error ? <p className="mt-1 text-sm text-red-700">{state.error}</p> : null}
  </form>);
}
