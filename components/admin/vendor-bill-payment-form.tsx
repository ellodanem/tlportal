"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { recordVendorBillPaymentAction, voidVendorBillAction, type BillActionState } from "@/app/admin/bills/actions";
import { EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/domain/expenses";
import type { ExpensePaymentMethod } from "@prisma/client";

const initialState: BillActionState = {};

export function VendorBillPaymentForm({ billId, amountDue, currency }: { billId: string; amountDue: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(recordVendorBillPaymentAction, initialState);
  useEffect(() => { if (state.ok) router.refresh(); }, [router, state.ok]);
  const methods = Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];
  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30">Record payment</button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby={`payment-title-${billId}`}><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"><div className="flex items-start justify-between border-b border-zinc-200 p-5 dark:border-zinc-700"><div><h2 id={`payment-title-${billId}`} className="text-base font-semibold">Record a manual payment</h2><p className="mt-1 text-sm text-zinc-500">{currency} {amountDue.toFixed(2)} currently due.</p></div><button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Close payment dialog">×</button></div><form action={action} className="grid gap-3 p-5 sm:grid-cols-2">
      <input type="hidden" name="billId" value={billId} />
      <label className="text-sm font-medium">Amount<input name="amount" type="number" min={0.01} max={amountDue} step="0.01" defaultValue={amountDue.toFixed(2)} required className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" /></label>
      <label className="text-sm font-medium">Payment method<select name="method" defaultValue="bank_transfer" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950">{methods.map((method) => <option key={method} value={method}>{EXPENSE_PAYMENT_METHOD_LABELS[method]}</option>)}</select></label>
      <label className="text-sm font-medium">Payment date<input name="paidAt" type="date" defaultValue={today()} required className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" /></label>
      <label className="text-sm font-medium">Reference<input name="reference" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" placeholder="Bank reference or cheque number" /></label>
      <label className="sm:col-span-2 text-sm font-medium">Notes<textarea name="notes" rows={2} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950" /></label>
      <div className="sm:col-span-2 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-blue-500">{pending ? "Saving…" : "Save payment"}</button>{state.error ? <p className="w-full text-sm text-red-700 dark:text-red-300">{state.error}</p> : null}{state.message ? <p className="w-full text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}</div>
    </form></div></div> : null}
  </>;
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
