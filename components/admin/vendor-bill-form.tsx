"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExpensePaymentMethod } from "@prisma/client";

import { saveVendorBillAction, type BillActionState } from "@/app/admin/bills/actions";
import { EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/domain/expenses";

export type BillVendorOption = { id: string; name: string; currency: string; paymentTerms: number };
export type BillCategoryOption = { id: string; name: string };
export type BillAttributionOption = { id: string; label: string };
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
  categoryId?: string;
  customerId?: string;
  deviceId?: string;
  hasReceipt?: boolean;
};

const emptyState: BillActionState = {};
const inputClass = "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export function VendorBillForm({ vendors, categories = [], customers = [], devices = [], initial }: {
  vendors: BillVendorOption[];
  categories?: BillCategoryOption[];
  customers?: BillAttributionOption[];
  devices?: BillAttributionOption[];
  initial?: VendorBillFormInitial;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveVendorBillAction, emptyState);
  const [vendorId, setVendorId] = useState(initial?.vendorId ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "XCD");
  const [total, setTotal] = useState(initial?.total ?? "");
  const [billDate, setBillDate] = useState(initial?.billDate ?? today());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("unpaid");

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
    <form action={action} encType="multipart/form-data" className="flex max-w-3xl flex-col gap-5">
      {initial?.id ? <input type="hidden" name="billId" value={initial.id} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Vendor<select name="vendorId" value={vendorId} onChange={(e) => selectVendor(e.target.value)} required className={inputClass}><option value="">Select a vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
        <label className="text-sm font-medium">Invoice / reference number<input name="vendorInvoiceNumber" defaultValue={initial?.vendorInvoiceNumber} className={inputClass} placeholder="Supplier reference" /></label>
        <label className="text-sm font-medium">Total<input name="total" type="number" min={0.01} step="0.01" required value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">Currency<input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={inputClass} maxLength={8} /></label>
        <label className="text-sm font-medium">Expense date<input name="billDate" type="date" required value={billDate} onChange={(e) => setBillDate(e.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">Due date<input name="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium sm:col-span-2">Description<input name="description" defaultValue={initial?.description} className={inputClass} placeholder="What was purchased?" /></label>
        <label className="text-sm font-medium">Category<select name="categoryId" defaultValue={initial?.categoryId} className={inputClass}><option value="">Uncategorized</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-medium">Customer attribution<select name="customerId" defaultValue={initial?.customerId} className={inputClass}><option value="">None</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-sm font-medium">Device attribution<select name="deviceId" defaultValue={initial?.deviceId} className={inputClass}><option value="">None</option>{devices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-sm font-medium">Receipt<input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={inputClass} /><span className="mt-1 block text-xs font-normal text-zinc-500">{initial?.hasReceipt ? "Uploading replaces the current receipt." : "Optional PDF or image."}</span></label>
        <label className="text-sm font-medium sm:col-span-2">Notes<textarea name="notes" rows={3} defaultValue={initial?.notes} className={inputClass} /></label>
        <fieldset className="rounded-xl border border-zinc-200 p-4 sm:col-span-2 dark:border-zinc-700">
          <legend className="px-1 text-sm font-semibold">Payment status</legend>
          <div className="mt-1 flex flex-wrap gap-4"><label className="flex min-h-11 items-center gap-2"><input type="radio" name="paymentStatus" value="unpaid" checked={paymentStatus === "unpaid"} onChange={() => setPaymentStatus("unpaid")} />Unpaid — pay later</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="paymentStatus" value="paid" checked={paymentStatus === "paid"} onChange={() => setPaymentStatus("paid")} />Paid</label></div>
          {paymentStatus === "paid" ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Payment method<select name="method" defaultValue="bank_transfer" className={inputClass}>{(Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[]).map((method) => <option key={method} value={method}>{EXPENSE_PAYMENT_METHOD_LABELS[method]}</option>)}</select></label><label className="text-sm font-medium">Payment reference<input name="paymentReference" className={inputClass} placeholder="Cheque, bank, or card reference" /></label></div> : null}
        </fieldset>
      </div>
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600">{pending ? "Saving…" : `Save ${paymentStatus} expense`}</button>
      {state.error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
    </form>
  );
}

function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function addDays(ymd: string, days: number) { const date = new Date(`${ymd}T12:00:00`); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
