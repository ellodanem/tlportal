"use client";

import { useActionState } from "react";
import type { BillingInvoiceClientRow } from "@/lib/admin/billing-invoice-client";

import {
  emailBillingInvoicePdfAction,
  regenerateBillingInvoicePdfAction,
  type BillingInvoiceActionState,
} from "@/app/admin/customers/billing-actions";
import { invoilessInvoicePreviewUrl } from "@/lib/invoiless/preview-url";
import { formatXcd } from "@/lib/subscription-options/display";

const invoiceActionInitial: BillingInvoiceActionState = { error: null };

function formatDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "paid") {
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
  }
  if (s === "open") {
    return "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200";
  }
  if (s === "past_due" || s === "uncollectible") {
    return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200";
  }
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function InvoicePdfActions({
  inv,
  customerId,
  customerEmail,
}: {
  inv: BillingInvoiceClientRow;
  customerId: string;
  customerEmail: string | null;
}) {
  const [regenState, regenAction, regenPending] = useActionState(
    regenerateBillingInvoicePdfAction,
    invoiceActionInitial,
  );
  const [emailState, emailAction, emailPending] = useActionState(
    emailBillingInvoicePdfAction,
    invoiceActionInitial,
  );

  const isPaid = inv.status.toLowerCase() === "paid";
  const feedback = regenState.error ?? regenState.message ?? emailState.error ?? emailState.message;

  return (
    <div className="flex flex-col gap-1">
      {isPaid ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/admin/billing-invoices/${inv.id}/pdf`}
            className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Download
          </a>
          {customerEmail ? (
            <form action={emailAction} className="inline">
              <input type="hidden" name="billingInvoiceId" value={inv.id} />
              <input type="hidden" name="customerId" value={customerId} />
              <button
                type="submit"
                disabled={emailPending}
                className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
              >
                {emailPending ? "Sending…" : "Email"}
              </button>
            </form>
          ) : null}
          <form action={regenAction} className="inline">
            <input type="hidden" name="billingInvoiceId" value={inv.id} />
            <input type="hidden" name="customerId" value={customerId} />
            <button
              type="submit"
              disabled={regenPending}
              className="text-xs text-zinc-500 hover:underline disabled:opacity-50 dark:text-zinc-400"
              title="Regenerate TL PDF from current Stripe data"
            >
              {regenPending ? "…" : "Regenerate"}
            </button>
          </form>
        </div>
      ) : null}
      {inv.hostedInvoiceUrl ? (
        <a
          href={inv.hostedInvoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Stripe view
        </a>
      ) : inv.invoicePdfUrl ? (
        <a
          href={inv.invoicePdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Stripe PDF
        </a>
      ) : null}
      {feedback ? (
        <span className={`text-xs ${regenState.error || emailState.error ? "text-rose-600" : "text-zinc-500"}`}>
          {feedback}
        </span>
      ) : null}
      {isPaid && !inv.pdfGeneratedAt ? (
        <span className="text-xs text-amber-700 dark:text-amber-400">TL PDF pending</span>
      ) : null}
    </div>
  );
}

export function StripeInvoicesList({
  invoices,
  customerId,
  customerEmail,
}: {
  invoices: BillingInvoiceClientRow[];
  customerId: string;
  customerEmail: string | null;
}) {
  if (invoices.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No Stripe invoices mirrored yet. They appear after Checkout and subscription renewals (webhooks:
        invoice.paid, invoice.finalized). Paid invoices receive a TL-branded PDF (
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">TL-INV-…</code>) when Blob storage is
        configured.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        <thead className="bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3 text-left">Invoice</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Amount</th>
            <th className="px-4 py-3 text-left">Period</th>
            <th className="px-4 py-3 text-left">Paid</th>
            <th className="px-4 py-3 text-left">Invoiless</th>
            <th className="px-4 py-3 text-left">Receipt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td className="px-4 py-3">
                <span className="font-mono text-xs font-medium">
                  {inv.displayNumber ?? inv.providerInvoiceNumber ?? inv.externalInvoiceId}
                </span>
                {inv.providerInvoiceNumber && inv.displayNumber ? (
                  <span className="mt-0.5 block font-mono text-xs text-zinc-500">
                    Stripe {inv.providerInvoiceNumber}
                  </span>
                ) : null}
                <span className="mt-0.5 block text-xs capitalize text-zinc-500">{inv.kind.replace("_", " ")}</span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(inv.status)}`}
                >
                  {inv.status}
                </span>
              </td>
              <td className="px-4 py-3 tabular-nums">
                {formatXcd(inv.amountXcd)}
                <span className="ml-1 text-xs uppercase text-zinc-500">{inv.currency}</span>
              </td>
              <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                {inv.periodStart || inv.periodEnd ? (
                  <>
                    {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{formatDate(inv.paidAt)}</td>
              <td className="px-4 py-3">
                {inv.invoilessMirrorInvoiceId ? (
                  <a
                    href={invoilessInvoicePreviewUrl(inv.invoilessMirrorInvoiceId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Mirrored
                  </a>
                ) : inv.status === "paid" ? (
                  <span className="text-xs text-zinc-500">Pending mirror</span>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <InvoicePdfActions inv={inv} customerId={customerId} customerEmail={customerEmail} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
