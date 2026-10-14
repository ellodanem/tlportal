"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { recordVendorBillPaymentAction, voidVendorBillAction, type BillActionState } from "@/app/admin/bills/actions";
import { EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/domain/expenses";
import type { ExpensePaymentMethod } from "@prisma/client";

const initialState: BillActionState = {};

export function VendorBillPaymentForm({ billId, amountDue, currency }: { billId: string; amountDue: number; currency: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(recordVendorBillPaymentAction, initialState);
  useEffect(() => { if (state.ok) router.refresh(); }, [router, state.ok]);
  const methods = Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50 sm:grid-cols-2">
      <input type="hidden" name="billId" value={billId} />
      <div className="sm:col-span-2"><h2 className="text-sm font-semibold">Record payment</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{currency} {amountDue.toFixed(2)} due.</p></div>
      <label className="text-sm font-medium">Amount<input name="amount" type="number" min={0.01} max={amountDue} step="0.01" defaultValue={amountDue.toFixed(2)} required className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" /></label>
      <label className="text-sm font-medium">Payment method<select name="method" defaultValue="bank_transfer" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950">{methods.map((method) => <option key={method} value={method}>{EXPENSE_PAYMENT_METHOD_LABELS[method]}</option>)}</select></label>
      <label className="text-sm font-medium">Payment date<input name="paidAt" type="date" defaultValue={today()} required className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" /></label>
      <label className="text-sm font-medium">Reference<input name="reference" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" placeholder="Bank reference or cheque number" /></label>
      <label className="sm:col-span-2 text-sm font-medium">Notes<textarea name="notes" rows={2} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" /></label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-emerald-600">{pending ? "Saving…" : "Record payment"}</button>{state.error ? <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p> : null}{state.message ? <p className="text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}</div>
    </form>
  );
}

export function VendorBillVoidForm({ billId }: { billId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(voidVendorBillAction, initialState);
  useEffect(() => { if (state.ok) router.refresh(); }, [router, state.ok]);
  return <form action={action} className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/50 dark:bg-rose-950/20"><input type="hidden" name="billId" value={billId} /><button type="submit" disabled={pending} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/50">{pending ? "Voiding…" : "Void bill"}</button>{state.error ? <p className="text-sm text-rose-800 dark:text-rose-300">{state.error}</p> : null}</form>;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
