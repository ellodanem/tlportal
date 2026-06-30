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

export function RecurringScheduleForm({
  customers,
  initial,
  readOnly = false,
}: {
  customers: RecurringCustomerOption[];
  initial?: RecurringScheduleFormInitial;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const lineIdRef = useRef(0);
  const scheduleId = initial?.scheduleId ?? "";

  const [name, setName] = useState(initial?.name ?? "");
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
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
    (initial?.lines?.length ? initial.lines : [{ description: "", quantity: "1", unitPrice: "0" }]).map((row) => ({
      ...row,
      id: lineIdRef.current++,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const [saveState, saveAction] = useActionState(saveRecurringScheduleAction, initialSave);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

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
    <div className="flex max-w-3xl flex-col gap-5">
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
        <div className="mt-3 flex flex-col gap-3">
          {lines.map((row, i) => (
            <div key={row.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <span className="text-xs font-semibold uppercase text-zinc-500">Line {i + 1}</span>
              <input
                type="text"
                value={row.description}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, description: e.target.value } : r)),
                  )
                }
                placeholder="Description"
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0.0001}
                  step="any"
                  value={row.quantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r)),
                    )
                  }
                  className="rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.unitPrice}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, unitPrice: e.target.value } : r)),
                    )
                  }
                  className="rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
              </div>
            </div>
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
    </div>
  );
}
