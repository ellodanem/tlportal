"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import type { StatementPeriodPreset } from "@/lib/billing/customer-statement";

export type CustomerStatementFormCustomer = { id: string; name: string };

type Props = {
  customers: CustomerStatementFormCustomer[];
  /** When set, customer is locked (customer tab). */
  lockedCustomerId?: string;
  lockedCustomerName?: string;
  basePath: string;
  initialPreset: StatementPeriodPreset;
  initialFrom: string;
  initialTo: string;
  initialCustomerId?: string;
};

const PRESETS: { id: StatementPeriodPreset; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_year", label: "This year" },
  { id: "custom", label: "Custom" },
];

export function CustomerStatementForm({
  customers,
  lockedCustomerId,
  lockedCustomerName,
  basePath,
  initialPreset,
  initialFrom,
  initialTo,
  initialCustomerId,
}: Props) {
  const router = useRouter();
  const [preset, setPreset] = useState<StatementPeriodPreset>(initialPreset);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [customerId, setCustomerId] = useState(lockedCustomerId ?? initialCustomerId ?? "");

  const effectiveCustomerId = lockedCustomerId ?? customerId;
  const showCustomDates = preset === "custom";

  const pdfHref = useMemo(() => {
    if (!effectiveCustomerId) return null;
    const params = new URLSearchParams({ customerId: effectiveCustomerId });
    if (preset === "custom") {
      params.set("from", from);
      params.set("to", to);
    } else {
      params.set("preset", preset);
    }
    return `/api/admin/statements/pdf?${params.toString()}`;
  }, [effectiveCustomerId, from, preset, to]);

  const applySearch = useCallback(() => {
    const params = new URLSearchParams();
    if (effectiveCustomerId && !lockedCustomerId) {
      params.set("customerId", effectiveCustomerId);
    }
    params.set("preset", preset);
    if (preset === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }, [basePath, effectiveCustomerId, from, lockedCustomerId, preset, router, to]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        {lockedCustomerId ? (
          <div className="min-w-[12rem] flex-1">
            <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Customer</span>
            <p className="mt-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{lockedCustomerName}</p>
          </div>
        ) : (
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="statementCustomer" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Customer
            </label>
            <select
              id="statementCustomer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="min-w-[12rem] flex-1">
          <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Period</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  preset === p.id
                    ? "bg-emerald-600 text-white dark:bg-emerald-500"
                    : "border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {showCustomDates ? (
          <>
            <div>
              <label htmlFor="statementFrom" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                From
              </label>
              <input
                id="statementFrom"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </div>
            <div>
              <label htmlFor="statementTo" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                To
              </label>
              <input
                id="statementTo"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={applySearch}
          disabled={!effectiveCustomerId}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500"
        >
          Generate preview
        </button>
        {pdfHref ? (
          <a
            href={pdfHref}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Download PDF
          </a>
        ) : null}
        {lockedCustomerId ? (
          <Link
            href={`/admin/statements?customerId=${lockedCustomerId}&preset=${preset}${preset === "custom" ? `&from=${from}&to=${to}` : ""}`}
            className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Open in Statements
          </Link>
        ) : null}
      </div>
    </div>
  );
}
