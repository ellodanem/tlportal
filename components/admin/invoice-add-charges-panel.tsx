"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { addInvoiceChargesAction, type AddInvoiceChargesState } from "@/app/admin/tl-invoices/actions";
import { INVOICE_ACTION_BUTTON_CLASS, InvoiceActionModal } from "@/components/admin/invoice-action-modal";
import { formatMoney } from "@/lib/domain/native-billing";

type Row = { id: string; description: string; quantity: string; unitPrice: string };

function defaultRows(batch: number): Row[] {
  return [
    { id: `b${batch}-device`, description: "Device", quantity: "1", unitPrice: "" },
    { id: `b${batch}-install`, description: "Installation", quantity: "1", unitPrice: "" },
  ];
}

const initialState: AddInvoiceChargesState = {};

type PanelProps = {
  invoiceId: string;
  currency: string;
  allowOnlinePayment: boolean;
  stripeConfigured: boolean;
  hasPayments: boolean;
};

export function InvoiceAddChargesPanel(props: PanelProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={INVOICE_ACTION_BUTTON_CLASS}
      >
        Add charges
      </button>
      <InvoiceActionModal
        open={open}
        onClose={close}
        title="Add charges to this invoice"
        maxWidthClass="max-w-2xl"
        description={
          <>
            Appends new lines (e.g. device and installation). Existing lines, the invoice number, and the pay link stay
            the same; the total and balance due update.
            {props.hasPayments ? " Payments already recorded are kept." : ""}
          </>
        }
      >
        <AddChargesBody {...props} onDone={close} />
      </InvoiceActionModal>
    </>
  );
}

function AddChargesBody({
  invoiceId,
  currency,
  allowOnlinePayment,
  stripeConfigured,
  onDone,
}: PanelProps & { onDone: () => void }) {
  const router = useRouter();
  const extraId = useRef(0);
  const [rows, setRows] = useState<Row[]>(() => defaultRows(0));
  const [state, action, pending] = useActionState(addInvoiceChargesAction, initialState);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  function update(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const addedTotal = rows.reduce((sum, r) => {
    const q = Number(r.quantity);
    const p = Number(r.unitPrice);
    return sum + (Number.isFinite(q) && Number.isFinite(p) && r.description.trim() ? q * p : 0);
  }, 0);

  const input =
    "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

  return (
      <form action={action} className="px-4 py-4 sm:px-5">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        {stripeConfigured ? <input type="hidden" name="allowOnlinePaymentPresent" value="1" /> : null}

        <div className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_4.5rem_6.5rem_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_7rem_1.75rem]"
            >
              <div className="col-span-4 sm:col-span-1">
                <label htmlFor={`charge-desc-${row.id}`} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Description
                </label>
                <input
                  id={`charge-desc-${row.id}`}
                  name="description"
                  type="text"
                  value={row.description}
                  onChange={(e) => update(row.id, { description: e.target.value })}
                  placeholder="Description"
                  className={`mt-1 ${input}`}
                />
              </div>
              <div>
                <label htmlFor={`charge-qty-${row.id}`} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Qty
                </label>
                <input
                  id={`charge-qty-${row.id}`}
                  name="quantity"
                  type="number"
                  inputMode="decimal"
                  min={0.0001}
                  step="any"
                  value={row.quantity}
                  onChange={(e) => update(row.id, { quantity: e.target.value })}
                  className={`mt-1 ${input}`}
                />
              </div>
              <div>
                <label htmlFor={`charge-rate-${row.id}`} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Rate ({currency.toUpperCase()})
                </label>
                <input
                  id={`charge-rate-${row.id}`}
                  name="unitPrice"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={row.unitPrice}
                  onChange={(e) => update(row.id, { unitPrice: e.target.value })}
                  placeholder="0.00"
                  className={`mt-1 tabular-nums ${input}`}
                />
              </div>
              <p className="hidden pb-2 text-right text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-200 sm:block">
                {formatMoney((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), currency)}
              </p>
              <button
                type="button"
                onClick={() => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== row.id)))}
                className="pb-2 text-lg leading-none text-zinc-400 hover:text-rose-600"
                aria-label={`Remove line ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, { id: `x${extraId.current++}`, description: "", quantity: "1", unitPrice: "" }])
          }
          className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
        >
          + Add another line
        </button>

        {stripeConfigured ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
            <input
              type="checkbox"
              name="allowOnlinePayment"
              defaultChecked={allowOnlinePayment}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600"
            />
            <span className="text-sm">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">Allow pay by card online</span>
              <span className="mt-0.5 block text-zinc-600 dark:text-zinc-400">
                Shows a Pay with card button on the customer pay link for the full balance due.
              </span>
            </span>
          </label>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm" aria-live="polite">
            {state.error ? (
              <p className="text-red-700 dark:text-red-400">{state.error}</p>
            ) : state.ok && state.message ? (
              <p className="text-emerald-700 dark:text-emerald-400">{state.message}</p>
            ) : (
              <p className="text-zinc-600 dark:text-zinc-400">
                Adding {formatMoney(addedTotal, currency)} to this invoice.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add to invoice"}
          </button>
        </div>
      </form>
  );
}
