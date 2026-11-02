import Link from "next/link";

import { NOT_LINKED_LABEL, type FinancialLedger, type LedgerRow } from "@/lib/domain/financial-ledger";
import { formatMoney, INVOICE_STATUS_LABELS, invoiceStatusBadgeClass, PAYMENT_METHOD_LABELS } from "@/lib/domain/native-billing";
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
    ? <Link href={`/admin/subscriptions/canonical/${row.subscriptionId}/billing`} className="text-emerald-700 hover:underline dark:text-emerald-400">{subscriptionLabels[row.subscriptionId] ?? "Subscription"}</Link>
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

type LedgerPaymentRow = FinancialLedger["payments"][number];

function paymentMethodLabel(method: string) {
  return (PAYMENT_METHOD_LABELS as Record<string, string>)[method] ?? method.replaceAll("_", " ");
}

/** "Cash · Jul 9, 2026" for the latest payment on an invoice, plus a count when there are more. */
function paymentNote(payments: LedgerPaymentRow[]) {
  if (payments.length === 0) return null;
  const [latest] = payments;
  return `${paymentMethodLabel(latest.method)} · ${dateLabel(latest.receivedAt)}${payments.length > 1 ? ` (+${payments.length - 1} more)` : ""}`;
}

/**
 * One invoice list for a single subscription in which each payment sits on the invoice it paid,
 * so there is no separate payments list. Rows are already scoped and filtered by the caller.
 * Recording a payment happens on the invoice itself, so open native rows link there.
 */
export function SubscriptionLedgerTable({ rows, payments, customerId, emptyMessage }: {
  rows: LedgerRow[];
  payments: LedgerPaymentRow[];
  customerId: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) return <p className="p-6 text-sm text-zinc-500">{emptyMessage}</p>;
  const paymentsByInvoice = new Map<string, LedgerPaymentRow[]>();
  for (const payment of payments) {
    paymentsByInvoice.set(payment.invoiceId, [...(paymentsByInvoice.get(payment.invoiceId) ?? []), payment]);
  }
  const noteFor = (row: LedgerRow) => paymentNote(row.nativeInvoiceId ? paymentsByInvoice.get(row.nativeInvoiceId) ?? [] : []);
  const action = (row: LedgerRow) => row.nativeInvoiceId && row.due > 0
    ? <Link href={`/admin/tl-invoices/${row.nativeInvoiceId}`} className="inline-flex min-h-9 items-center rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Record payment</Link>
    : null;

  return (
    <>
      <ul className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
        {rows.map((row) => (
          <li key={row.key} className="p-4 text-sm">
            <div className="flex items-start justify-between gap-3"><RowLabel row={row} customerId={customerId} /><StatusBadge status={row.status} /></div>
            <p className="mt-1 text-xs text-zinc-500">{SOURCE_LABEL[row.source]} · {dateLabel(row.date)}{row.dueDate ? ` · due ${dateLabel(row.dueDate)}` : ""}</p>
            <p className="mt-2 tabular-nums">{formatMoney(row.total, row.currency)} · <span className={row.due > 0 ? "font-semibold text-amber-800 dark:text-amber-300" : ""}>{formatMoney(row.due, row.currency)} due</span></p>
            {noteFor(row) ? <p className="mt-1 text-xs text-zinc-500">Paid {formatMoney(row.paid, row.currency)} · {noteFor(row)}</p> : null}
            {action(row) ? <div className="mt-3">{action(row)}</div> : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            <tr><th scope="col" className="px-4 py-2">Invoice</th><th scope="col" className="px-4 py-2">Source</th><th scope="col" className="px-4 py-2">Issued</th><th scope="col" className="px-4 py-2">Due</th><th scope="col" className="px-4 py-2 text-right">Amount</th><th scope="col" className="px-4 py-2">Paid</th><th scope="col" className="px-4 py-2">Status</th><th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-3"><RowLabel row={row} customerId={customerId} /></td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{SOURCE_LABEL[row.source]}</td>
                <td className="whitespace-nowrap px-4 py-3">{dateLabel(row.date)}</td>
                <td className="whitespace-nowrap px-4 py-3">{dateLabel(row.dueDate)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.total, row.currency)}</td>
                <td className="px-4 py-3 tabular-nums">
                  <span className={row.due > 0 ? "font-semibold text-amber-800 dark:text-amber-300" : ""}>{row.due > 0 ? `${formatMoney(row.due, row.currency)} due` : formatMoney(row.paid, row.currency)}</span>
                  {noteFor(row) ? <span className="block text-xs text-zinc-500">{noteFor(row)}</span> : null}
                </td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3 text-right">{action(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
