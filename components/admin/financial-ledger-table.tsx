import Link from "next/link";

import { NOT_LINKED_LABEL, type FinancialLedger, type LedgerRow } from "@/lib/domain/financial-ledger";
import { formatMoney, INVOICE_STATUS_LABELS, invoiceStatusBadgeClass } from "@/lib/domain/native-billing";
import type { InvoiceStatus } from "@prisma/client";

const SOURCE_LABEL: Record<LedgerRow["source"], string> = { native: "TL invoice", stripe: "Stripe", invoiless: "Invoiless" };

function dateLabel(value: Date | null) {
  return value?.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" }) ?? "—";
}

function StatusBadge({ status }: { status: string }) {
  if (status in INVOICE_STATUS_LABELS) {
    return <span className={invoiceStatusBadgeClass(status as InvoiceStatus)}>{INVOICE_STATUS_LABELS[status as InvoiceStatus]}</span>;
  }
  return <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium capitalize text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">{status.replaceAll("_", " ")}</span>;
}

function rowHref(row: LedgerRow, customerId: string) {
  return row.nativeInvoiceId ? `/admin/tl-invoices/${row.nativeInvoiceId}` : `/admin/subscriptions/customers/${customerId}/billing#provider-invoices`;
}

function RowLabel({ row, customerId }: { row: LedgerRow; customerId: string }) {
  return <Link href={rowHref(row, customerId)} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{row.label}</Link>;
}

/**
 * Invoice rows for one scope. `showSubscription` adds a column used on the customer ledger so an
 * invoice with no subscription link is labelled instead of looking like it does not exist.
 */
export function FinancialLedgerTable({
  ledger,
  customerId,
  showSubscription = false,
  subscriptionLabels = {},
  emptyMessage,
}: {
  ledger: FinancialLedger;
  customerId: string;
  showSubscription?: boolean;
  subscriptionLabels?: Record<string, string>;
  emptyMessage: string;
}) {
  const rows = ledger.rows;
  if (rows.length === 0) return <p className="p-6 text-sm text-zinc-500">{emptyMessage}</p>;
  const subscriptionCell = (row: LedgerRow) => row.subscriptionId
    ? <Link href={`/admin/subscriptions/canonical/${row.subscriptionId}/invoices`} className="text-emerald-700 hover:underline dark:text-emerald-400">{subscriptionLabels[row.subscriptionId] ?? "Subscription"}</Link>
    : <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{NOT_LINKED_LABEL}</span>;

  return (
    <>
      <ul className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
        {rows.map((row) => (
          <li key={row.key} className="p-4 text-sm">
            <div className="flex items-start justify-between gap-3"><RowLabel row={row} customerId={customerId} /><StatusBadge status={row.status} /></div>
            <p className="mt-1 text-xs text-zinc-500">{SOURCE_LABEL[row.source]} · {dateLabel(row.date)}{row.dueDate ? ` · due ${dateLabel(row.dueDate)}` : ""}</p>
            <p className="mt-2 tabular-nums">{formatMoney(row.total, row.currency)} · <span className={row.due > 0 ? "font-semibold text-amber-800 dark:text-amber-300" : ""}>{formatMoney(row.due, row.currency)} due</span></p>
            {showSubscription ? <p className="mt-2 text-xs">{subscriptionCell(row)}</p> : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr><th scope="col" className="px-4 py-2">Invoice</th><th scope="col" className="px-4 py-2">Source</th><th scope="col" className="px-4 py-2">Date</th><th scope="col" className="px-4 py-2">Due date</th><th scope="col" className="px-4 py-2 text-right">Total</th><th scope="col" className="px-4 py-2 text-right">Balance</th><th scope="col" className="px-4 py-2">Status</th>{showSubscription ? <th scope="col" className="px-4 py-2">Subscription</th> : null}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-3"><RowLabel row={row} customerId={customerId} /></td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{SOURCE_LABEL[row.source]}</td>
                <td className="whitespace-nowrap px-4 py-3">{dateLabel(row.date)}</td>
                <td className="whitespace-nowrap px-4 py-3">{dateLabel(row.dueDate)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.total, row.currency)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${row.due > 0 ? "font-semibold text-amber-800 dark:text-amber-300" : ""}`}>{formatMoney(row.due, row.currency)}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                {showSubscription ? <td className="px-4 py-3">{subscriptionCell(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function FinancialPaymentsList({ ledger }: { ledger: FinancialLedger }) {
  if (ledger.payments.length === 0) return <p className="p-6 text-sm text-zinc-500">No payments have been recorded against these invoices.</p>;
  return (
    <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
      {ledger.payments.map((payment) => (
        <li key={payment.id} className="flex flex-col justify-between gap-1 px-4 py-3 sm:flex-row sm:items-center">
          <span><span className="font-medium tabular-nums">{formatMoney(payment.amount, payment.currency)}</span> <span className="capitalize text-zinc-500">via {payment.method.replaceAll("_", " ")}</span>{payment.reference ? <span className="text-zinc-500"> · {payment.reference}</span> : null}</span>
          <span className="text-xs text-zinc-500">{payment.invoiceLabel} · {dateLabel(payment.receivedAt)}</span>
        </li>
      ))}
    </ul>
  );
}
