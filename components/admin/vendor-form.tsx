"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createVendorAction, updateVendorAction, type VendorActionState } from "@/app/admin/vendors/actions";

export type VendorFormInitial = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  currency: string;
  paymentTerms: number;
  notes: string;
};

const emptyState: VendorActionState = {};
const inputClass = "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export function VendorForm({ initial }: { initial?: VendorFormInitial }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(initial?.id ? updateVendorAction : createVendorAction, emptyState);
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "XCD");
  const [paymentTerms, setPaymentTerms] = useState(String(initial?.paymentTerms ?? 30));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  useEffect(() => {
    if (state.next) {
      router.push(state.next);
      router.refresh();
    }
  }, [router, state.next]);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      {initial?.id ? <input type="hidden" name="vendorId" value={initial.id} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm font-medium">Vendor name<input name="name" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Digicel Business" /></label>
        <label className="text-sm font-medium">Email<input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">Phone<input name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">Currency<input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={inputClass} maxLength={8} /></label>
        <label className="text-sm font-medium">Default payment terms (days)<input name="paymentTerms" type="number" min={0} max={365} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={inputClass} /></label>
      </div>
      <label className="text-sm font-medium">Notes<textarea name="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></label>
      {state.error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="self-start rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500">{pending ? "Saving…" : initial?.id ? "Save vendor" : "Add vendor"}</button>
    </form>
  );
}
