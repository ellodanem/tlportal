"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { saveExpenseAction, type SaveExpenseState } from "@/app/admin/expenses/actions";
import { EXPENSE_PAYMENT_METHOD_LABELS } from "@/lib/domain/expenses";
import type { ExpenseRequestPayload } from "@/lib/expenses/expense-payload";
import type { ExpensePaymentMethod } from "@prisma/client";

export type ExpenseCategoryOption = { id: string; name: string };
export type ExpenseCustomerOption = { id: string; label: string };
export type ExpenseDeviceOption = { id: string; label: string };

export type ExpenseFormInitial = {
  expenseId: string;
  vendor: string;
  description: string;
  amount: string;
  currency: string;
  expenseDate: string;
  method: ExpensePaymentMethod;
  reference: string;
  notes: string;
  categoryId: string;
  customerId: string;
  deviceId: string;
  hasReceipt: boolean;
};

function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

const initialSave: SaveExpenseState = {};

export function ExpenseForm({
  categories,
  customers,
  devices,
  initial,
}: {
  categories: ExpenseCategoryOption[];
  customers: ExpenseCustomerOption[];
  devices: ExpenseDeviceOption[];
  initial?: ExpenseFormInitial;
}) {
  const router = useRouter();
  const expenseId = initial?.expenseId ?? "";

  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "XCD");
  const [expenseDate, setExpenseDate] = useState(initial?.expenseDate ?? todayYmd());
  const [method, setMethod] = useState<ExpensePaymentMethod>(initial?.method ?? "card");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [deviceId, setDeviceId] = useState(initial?.deviceId ?? "");
  const [error, setError] = useState<string | null>(null);

  const [saveState, saveAction] = useActionState(saveExpenseAction, initialSave);

  useEffect(() => {
    if (saveState.ok && saveState.next) {
      router.push(saveState.next);
      router.refresh();
    }
  }, [saveState, router]);

  function buildPayload(): { payload: ExpenseRequestPayload } | { error: string } {
    const amt = Number(amount);
    if (!vendor.trim()) return { error: "Vendor is required." };
    if (!Number.isFinite(amt) || amt <= 0) return { error: "Enter a valid amount." };

    return {
      payload: {
        vendor: vendor.trim(),
        description: description.trim() || null,
        amount: amt,
        currency,
        expenseDate,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        categoryId: categoryId || null,
        customerId: customerId || null,
        deviceId: deviceId || null,
      },
    };
  }

  function submitSave(formData: FormData) {
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    formData.set("expensePayloadJson", JSON.stringify(built.payload));
    if (expenseId) formData.set("expenseId", expenseId);
    saveAction(formData);
  }

  return (
    <form action={submitSave} encType="multipart/form-data" className="flex max-w-3xl flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Vendor / payee</label>
          <input
            type="text"
            required
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Amount</label>
          <input
            type="number"
            min={0.01}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Currency</label>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Expense date</label>
          <input
            type="date"
            required
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Payment method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as ExpensePaymentMethod)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            {(Object.keys(EXPENSE_PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {EXPENSE_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Customer (optional)</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            <option value="">—</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Device (optional)</label>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            <option value="">—</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Reference</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque #, bank ref, card last four…"
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Receipt (PDF or image)</label>
          {initial?.hasReceipt ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Receipt on file —{" "}
              <a
                href={`/api/admin/expenses/${expenseId}/receipt`}
                className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                View / download
              </a>
              . Upload a new file to replace.
            </p>
          ) : null}
          <input
            type="file"
            name="receipt"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="mt-1.5 block w-full text-sm"
          />
        </div>
      </div>

      {(error || saveState.error) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error ?? saveState.error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">
          {expenseId ? "Save changes" : "Record expense"}
        </button>
        <Link href="/admin/expenses" className="text-sm font-medium text-zinc-600 hover:underline">
          All expenses
        </Link>
      </div>
    </form>
  );
}
