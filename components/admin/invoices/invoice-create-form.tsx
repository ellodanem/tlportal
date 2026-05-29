"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { invoiceCreateInitialState } from "@/app/admin/invoices/action-state";
import { createInvoiceFromPortal } from "@/app/admin/invoices/actions";

export type InvoiceCreateCustomerOption = { id: string; name: string };

/** Default for `<input type="date">` (local calendar day). */
function todayDateInputValue(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
    >
      {pending ? "Creating…" : "Create in Invoiless"}
    </button>
  );
}

export function InvoiceCreateForm({ customers }: { customers: InvoiceCreateCustomerOption[] }) {
  const [state, formAction] = useActionState(createInvoiceFromPortal, invoiceCreateInitialState);
  const lineIdRef = useRef(0);
  const [lineIds, setLineIds] = useState<number[]>(() => [lineIdRef.current++]);

  function addLine() {
    setLineIds((ids) => [...ids, lineIdRef.current++]);
  }

  function removeLine(id: number) {
    setLineIds((ids) => (ids.length <= 1 ? ids : ids.filter((x) => x !== id)));
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <div>
        <label htmlFor="tlCustomerId" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Customer
        </label>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Only customers linked to Invoiless (sync on their edit page first).
        </p>
        <select
          id="tlCustomerId"
          name="tlCustomerId"
          required
          className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="">Select…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Line items</legend>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          One or more rows; each needs a description, quantity, and unit price. Empty rows are ignored.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {lineIds.map((rowId, index) => (
            <div
              key={rowId}
              className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Line {index + 1}
                </span>
                {lineIds.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeLine(rowId)}
                    className="text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                  >
                    Remove line
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="sr-only" htmlFor={`itemName-${rowId}`}>
                    Description line {index + 1}
                  </label>
                  <input
                    id={`itemName-${rowId}`}
                    name="itemName"
                    type="text"
                    maxLength={100}
                    placeholder="Description (e.g. GPS subscription)"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="sr-only" htmlFor={`quantity-${rowId}`}>
                    Quantity line {index + 1}
                  </label>
                  <input
                    id={`quantity-${rowId}`}
                    name="quantity"
                    type="number"
                    min={0.0001}
                    step="any"
                    defaultValue={1}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">Quantity</span>
                </div>
                <div>
                  <label className="sr-only" htmlFor={`unitPrice-${rowId}`}>
                    Unit price line {index + 1}
                  </label>
                  <input
                    id={`unitPrice-${rowId}`}
                    name="unitPrice"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={0}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">Unit price</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLine}
          className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-emerald-400 hover:text-emerald-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-600 dark:hover:text-emerald-300"
        >
          + Add line item
        </button>
      </fieldset>

      <div>
        <label htmlFor="status" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Status in Invoiless
        </label>
        <select
          id="status"
          name="status"
          defaultValue="Unpaid"
          className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <option value="Draft">Draft</option>
          <option value="Pending">Pending</option>
          <option value="Unpaid">Unpaid</option>
        </select>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Pending or Unpaid sends a WhatsApp to the customer (if phone on file). Draft skips WhatsApp; Invoiless may still
          email when you send from their app.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="invoiceDate" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Invoice date
          </label>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Issue date sent to Invoiless as <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">date</code>. Change
            when creating an invoice after the fact.
          </p>
          <input
            id="invoiceDate"
            name="invoiceDate"
            type="date"
            required
            defaultValue={todayDateInputValue()}
            className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label htmlFor="dueDate" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Due date <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Must be on or after the invoice date in Invoiless.</p>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Notes <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={1000}
          className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      {state.error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        <Link
          href="/admin/invoices"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
