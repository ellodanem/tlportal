"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { saveVendorBillAction, type BillActionState } from "@/app/admin/bills/actions";

export type BillVendorOption = { id: string; name: string; currency: string; paymentTerms: number };
export type VendorBillFormInitial = {
  id?: string;
  vendorId: string;
  vendorInvoiceNumber: string;
  description: string;
  currency: string;
  total: string;
  billDate: string;
  dueDate: string;
  notes: string;
  status: "draft" | "open";
};

const emptyState: BillActionState = {};
const inputClass = "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export function VendorBillForm({ vendors, initial }: { vendors: BillVendorOption[]; initial?: VendorBillFormInitial }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveVendorBillAction, emptyState);
  const [vendorId, setVendorId] = useState(initial?.vendorId ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "XCD");
  const [total, setTotal] = useState(initial?.total ?? "");
  const [billDate, setBillDate] = useState(initial?.billDate ?? today());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");

  useEffect(() => {
    if (state.next) {
      router.push(state.next);
      router.refresh();
    }
  }, [router, state.next]);

  function selectVendor(id: string) {
    setVendorId(id);
    const vendor = vendors.find((item) => item.id === id);
    if (vendor) {
      setCurrency(vendor.currency);
      if (!dueDate && billDate) setDueDate(addDays(billDate, vendor.paymentTerms));
    }
  }

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-5">
      {initial?.id ? <input type="hidden" name="billId" value={initial.id} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm font-medium">Vendor<select name="vendorId" value={vendorId} onChange={(e) => selectVendor(e.target.value)} required className={inputClass}><option value="">Select a vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
        <label className="text-sm font-medium">Vendor invoice number<input name="vendorInvoiceNumber" defaultValue={initial?.vendorInvoiceNumber} className={inputClass} placeholder="Supplier reference" /></label>
        <label className="text-sm font-medium">Total<input name="total" type="number" min={0.01} step="0.01" required value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">Currency<input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={inputClass} maxLength={8} /></label>
        <label className="text-sm font-medium">Bill date<input name="billDate" type="date" required value={billDate} onChange={(e) => setBillDate(e.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">Due date<input name="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} /></label>
        <label className="sm:col-span-2 text-sm font-medium">Description<input name="description" defaultValue={initial?.description} className={inputClass} placeholder="Monthly connectivity invoice" /></label>
        <label className="sm:col-span-2 text-sm font-medium">Notes<textarea name="notes" rows={3} defaultValue={initial?.notes} className={inputClass} /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button name="status" value="draft" type="submit" disabled={pending} className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800">{pending ? "Saving…" : "Save draft"}</button>
        <button name="status" value="open" type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600">Save as open</button>
      </div>
      {state.error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
    </form>
  );
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(ymd: string, days: number) {
  const date = new Date(`${ymd}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
