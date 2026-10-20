"use client";

import { useState } from "react";

type RecentPayment = {
  id: string;
  date: string;
  invoiceNumber: string | null;
  amount: string;
  method: string;
  reference: string | null;
};

export function RecentPaymentsTable({ payments }: { payments: RecentPayment[] }) {
  const [showReferences, setShowReferences] = useState(false);

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className="px-2 py-2">Date</th>
            <th className="w-40 whitespace-nowrap px-2 py-2">Invoice</th>
            <th className="px-2 py-2">Amount</th>
            <th className="px-2 py-2">Method</th>
            <th className="px-2 py-2 text-right">
              <button type="button" onClick={() => setShowReferences((visible) => !visible)} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100" aria-label={showReferences ? "Hide payment references" : "Show payment references"} aria-pressed={showReferences} title={showReferences ? "Hide payment references" : "Show payment references"}>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12S5.25 5.25 12 5.25 21.75 12 21.75 12 18.75 18.75 12 18.75 2.25 12 2.25 12Z" /><circle cx="12" cy="12" r="2.75" /></svg>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"><td className="whitespace-nowrap px-2 py-3">{payment.date}</td><td className="w-40 whitespace-nowrap px-2 py-3">{payment.invoiceNumber ?? "—"}</td><td className="whitespace-nowrap px-2 py-3 tabular-nums">{payment.amount}</td><td className="whitespace-nowrap px-2 py-3 capitalize">{payment.method.replaceAll("_", " ")}</td><td className="px-2 py-3 text-right">{showReferences ? <span className="whitespace-nowrap">{payment.reference ?? "—"}</span> : null}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
