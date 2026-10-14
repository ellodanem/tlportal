"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  saveRecurringScheduleAction,
  type SaveRecurringScheduleState,
} from "@/app/admin/recurring-invoices/actions";
import { RECURRING_INTERVAL_MONTH_OPTIONS } from "@/lib/domain/native-billing";
import type { RecurringScheduleRequestPayload } from "@/lib/billing/recurring-schedule-payload";
import { computeDocumentTotals, formatMoney } from "@/lib/domain/native-billing";

export type RecurringCustomerOption = {
  id: string;
  label: string;
  email: string | null;
  billToLines: string[];
};

export type RecurringScheduleFormInitial = {
  scheduleId: string;
  status: string;
  name: string;
  customerId: string | null;
  clientName: string;
  currency: string;
  notes: string;
  paymentInstructions: string;
  intervalMonths: number;
  nextIssueDate: string;
  dueDaysAfterIssue: number;
  autoEmail: boolean;
  emailTo: string;
  lines: { description: string; quantity: string; unitPrice: string }[];
};

const DEFAULT_PAYMENT_INSTRUCTIONS =
  "Cash or cheque accepted. Cheques payable to Ellodane Enterprises. Contact us for bank transfer details.";

type LineRow = { id: number; description: string; quantity: string; unitPrice: string };

function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

const initialSave: SaveRecurringScheduleState = {};

function RecurringInvoicePreview({ customer, clientName, currency, lines, notes, paymentInstructions, interval, nextIssueDate, total }: { customer: RecurringCustomerOption | null; clientName: string; currency: string; lines: LineRow[]; notes: string; paymentInstructions: string; interval: string; nextIssueDate: string; total: number }) {
  const billTo = customer?.billToLines ?? (clientName.trim() ? [clientName.trim()] : []);
  const visibleLines = lines.filter((line) => line.description.trim());
  const date = nextIssueDate ? new Date(`${nextIssueDate}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" }) : "-";
  return <aside className="min-w-0 lg:sticky lg:top-5 lg:self-start"><div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"><div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Live preview</p><p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">Generated invoice</p></div><div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">TL</div></div><div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Recurring</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Invoice</h2><p className="mt-1 text-xs text-zinc-500">Next issue {date}</p></div><div className="text-right text-xs text-zinc-500"><p>Cadence</p><p className="mt-1 font-medium text-zinc-800 dark:text-zinc-200">{interval}</p></div></div><div className="mt-7 border-b border-zinc-200 pb-5 text-sm dark:border-zinc-700"><p className="text-xs font-medium text-zinc-500">Billed to</p><p className="mt-2 font-semibold text-zinc-900 dark:text-white">{billTo[0] || "Select a customer"}</p>{billTo.slice(1).map((line, index) => <p key={`${line}-${index}`} className="text-xs text-zinc-500">{line}</p>)}{customer?.email ? <p className="mt-1 text-xs text-zinc-500">{customer.email}</p> : null}</div><div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950"><span>Item / service</span><span>Qty</span><span>Total</span></div>{visibleLines.length ? visibleLines.map((line) => <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-zinc-100 px-3 py-3 text-sm dark:border-zinc-800"><span className="break-words text-zinc-800 dark:text-zinc-200">{line.description}</span><span className="text-zinc-500">{line.quantity || "0"}</span><span className="font-medium tabular-nums">{formatMoney((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), currency)}</span></div>) : <p className="px-3 py-8 text-center text-sm text-zinc-500">Add line items to see them here.</p>}<div className="flex items-center justify-between border-t border-zinc-200 px-3 py-3 text-sm font-semibold dark:border-zinc-700"><span>Invoice total</span><span className="tabular-nums">{formatMoney(total, currency)}</span></div></div><div className="mt-7 space-y-4 text-xs text-zinc-500"><div><p className="font-semibold text-zinc-700 dark:text-zinc-300">Payment instructions</p><p className="mt-1 whitespace-pre-wrap">{paymentInstructions || "Add payment instructions in the editor."}</p></div>{notes ? <div><p className="font-semibold text-zinc-700 dark:text-zinc-300">Notes</p><p className="mt-1 whitespace-pre-wrap">{notes}</p></div> : null}</div></div></div></aside>;
}

export function RecurringScheduleForm({
  customers,
  initial,
  initialCustomerId,
  readOnly = false,
}: {
  customers: RecurringCustomerOption[];
  initial?: RecurringScheduleFormInitial;
  initialCustomerId?: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const lineIdRef = useRef(initial?.lines?.length ?? 1);
  const scheduleId = initial?.scheduleId ?? "";

  const [name, setName] = useState(initial?.name ?? "");
  const [customerId, setCustomerId] = useState(initial?.customerId ?? initialCustomerId ?? "");
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "XCD");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [paymentInstructions, setPaymentInstructions] = useState(
    initial?.paymentInstructions || DEFAULT_PAYMENT_INSTRUCTIONS,
  );
  const [intervalMonths, setIntervalMonths] = useState(String(initial?.intervalMonths ?? 1));
  const [nextIssueDate, setNextIssueDate] = useState(initial?.nextIssueDate ?? todayYmd());
  const [dueDaysAfterIssue, setDueDaysAfterIssue] = useState(String(initial?.dueDaysAfterIssue ?? 30));
  const [autoEmail, setAutoEmail] = useState(initial?.autoEmail ?? true);
  const [emailTo, setEmailTo] = useState(initial?.emailTo ?? "");
  const [lines, setLines] = useState<LineRow[]>(() =>
    (initial?.lines?.length ? initial.lines : [{ description: "", quantity: "1", unitPrice: "0" }]).map((row, index) => ({
      ...row,
      id: index,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const [saveState, saveAction] = useActionState(saveRecurringScheduleAction, initialSave);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const recurringTotal = useMemo(() => computeDocumentTotals(lines.map((line) => ({ description: line.description.trim(), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })).filter((line) => line.description), null, 0).total, [lines]);

  const isEnded = initial?.status === "ended";
  const fieldsDisabled = readOnly || isEnded;

  useEffect(() => {
    if (saveState.ok && saveState.next) {
      router.push(saveState.next);
      router.refresh();
    }
  }, [saveState, router]);

  function buildPayload(): { payload: RecurringScheduleRequestPayload } | { error: string } {
    const lineItems = lines
      .map((row) => ({
        description: row.description.trim(),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
      }))
      .filter((row) => row.description.length > 0);

    if (!lineItems.length) return { error: "Add at least one line item." };

    const billToLines =
      selectedCustomer?.billToLines ?? (clientName.trim() ? [clientName.trim()] : null);
    if (!billToLines?.length) return { error: "Choose a customer or enter a client name." };

    const months = Number(intervalMonths);
    const dueDays = Number(dueDaysAfterIssue);

    return {
      payload: {
        name: name.trim() || null,
        customerId: customerId || null,
        billToLines,
        currency,
        notes: notes.trim() || null,
        paymentInstructions: paymentInstructions.trim() || null,
        intervalMonths: months,
        nextIssueDate,
        dueDaysAfterIssue: dueDays,
        autoEmail,
        emailTo: emailTo.trim() || null,
        serviceAssignmentId: null,
        lineItems,
      },
    };
  }

  function submitSave(formData: FormData) {
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    formData.set("schedulePayloadJson", JSON.stringify(built.payload));
    if (scheduleId) formData.set("scheduleId", scheduleId);
    saveAction(formData);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.86fr)]"><div className="flex min-w-0 flex-col gap-5">
      <div>
        <label className="block text-sm font-medium">Schedule name</label>
        <input
          type="text"
          value={name}
          disabled={fieldsDisabled}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Fleet monitoring — Acme Ltd"
          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Customer</label>
          <select
            value={customerId}
            disabled={fieldsDisabled}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setClientName("");
            }}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          >
            <option value="">Select or enter name below…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {!customerId ? (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">Client name</label>
            <input
              type="text"
              value={clientName}
              disabled={fieldsDisabled}
              onChange={(e) => setClientName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
        ) : null}
        <div>
          <label className="block text-sm font-medium">Interval</label>
          <select
            value={intervalMonths}
            disabled={fieldsDisabled}
            onChange={(e) => setIntervalMonths(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          >
            {RECURRING_INTERVAL_MONTH_OPTIONS.map((opt) => (
              <option key={opt.months} value={opt.months}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Currency</label>
          <input
            type="text"
            value={currency}
            disabled={fieldsDisabled}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Next issue date</label>
          <input
            type="date"
            value={nextIssueDate}
            disabled={fieldsDisabled}
            onChange={(e) => setNextIssueDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Due days after issue</label>
          <input
            type="number"
            min={0}
            max={365}
            value={dueDaysAfterIssue}
            disabled={fieldsDisabled}
            onChange={(e) => setDueDaysAfterIssue(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
      </div>

      <fieldset disabled={fieldsDisabled} className="border-0 p-0">
        <legend className="text-sm font-medium">Line items (each cycle)</legend>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700"><div className="grid min-w-[540px] grid-cols-[22px_minmax(180px,1fr)_72px_110px_92px_28px] gap-2 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950"><span /><span>Description</span><span>Qty</span><span>Rate</span><span className="text-right">Amount</span><span /></div>
          {lines.map((row, i) => (
            <div key={row.id} className="grid min-w-[540px] grid-cols-[22px_minmax(180px,1fr)_72px_110px_92px_28px] items-center gap-2 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800"><span className="text-zinc-400" aria-hidden="true">⋮⋮</span><label className="sr-only" htmlFor={`recurring-description-${row.id}`}>Description line {i + 1}</label><input
                id={`recurring-description-${row.id}`}
                type="text"
                value={row.description}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, description: e.target.value } : r)),
                  )
                }
                placeholder="Description"
                className="w-full rounded-lg border px-2.5 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              /><label className="sr-only" htmlFor={`recurring-quantity-${row.id}`}>Quantity line {i + 1}</label><input
                  id={`recurring-quantity-${row.id}`}
                  type="number"
                  min={0.0001}
                  step="any"
                  value={row.quantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r)),
                    )
                  }
                  className="w-full rounded-lg border px-2.5 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                /><label className="sr-only" htmlFor={`recurring-rate-${row.id}`}>Rate line {i + 1}</label><input
                  id={`recurring-rate-${row.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.unitPrice}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, unitPrice: e.target.value } : r)),
                    )
                  }
                  className="w-full rounded-lg border px-2.5 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                /><span className="text-right text-sm font-medium tabular-nums">{formatMoney((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), currency)}</span><button type="button" onClick={() => setLines((p) => p.length <= 1 ? p : p.filter((r) => r.id !== row.id))} disabled={fieldsDisabled || lines.length <= 1} className="text-zinc-400 hover:text-rose-600 disabled:opacity-30" aria-label={`Remove line ${i + 1}`}>×</button></div>
          ))}
        </div>
        {!fieldsDisabled ? (
          <button
            type="button"
            onClick={() =>
              setLines((p) => [...p, { id: lineIdRef.current++, description: "", quantity: "1", unitPrice: "0" }])
            }
            className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            + Add line
          </button>
        ) : null}
      </fieldset>

      <div>
        <label className="block text-sm font-medium">Payment instructions</label>
        <textarea
          rows={3}
          value={paymentInstructions}
          disabled={fieldsDisabled}
          onChange={(e) => setPaymentInstructions(e.target.value)}
          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={autoEmail}
            disabled={fieldsDisabled}
            onChange={(e) => setAutoEmail(e.target.checked)}
          />
          Email invoice automatically when generated
        </label>
        <div>
          <label className="block text-xs font-medium text-zinc-600">Email override (optional)</label>
          <input
            type="email"
            value={emailTo}
            disabled={fieldsDisabled || !autoEmail}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder={selectedCustomer?.email ?? "Uses customer email"}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Notes</label>
        <textarea
          rows={2}
          value={notes}
          disabled={fieldsDisabled}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
        />
      </div>

      {(error || saveState.error) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error ?? saveState.error}
        </p>
      )}

      {!fieldsDisabled ? (
        <form action={submitSave}>
          <button type="submit" className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">
            {scheduleId ? "Save changes" : "Create schedule"}
          </button>
        </form>
      ) : null}

      <Link href="/admin/recurring-invoices" className="text-sm font-medium text-zinc-600 hover:underline">
        All recurring schedules
      </Link>
    </div><RecurringInvoicePreview customer={selectedCustomer} clientName={clientName} currency={currency} lines={lines} notes={notes} paymentInstructions={paymentInstructions} interval={RECURRING_INTERVAL_MONTH_OPTIONS.find((option) => String(option.months) === intervalMonths)?.label ?? `${intervalMonths} month cycle`} nextIssueDate={nextIssueDate} total={recurringTotal} /></div>
  );
}
