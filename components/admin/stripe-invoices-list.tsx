import type { BillingInvoice } from "@prisma/client";

import { invoilessInvoicePreviewUrl } from "@/lib/invoiless/invoices-list";
import { formatXcd } from "@/lib/subscription-options/display";

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

export function StripeInvoicesList({ invoices }: { invoices: BillingInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No Stripe invoices mirrored yet. They appear after Checkout and subscription renewals (webhooks:
        invoice.paid, invoice.finalized). Paid Stripe invoices also create a matching Invoiless invoice when the
        customer is linked to Invoiless.
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
            <th className="px-4 py-3 text-left">PDF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td className="px-4 py-3">
                <span className="font-mono text-xs">{inv.invoiceNumber ?? inv.externalInvoiceId}</span>
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
                {inv.hostedInvoiceUrl ? (
                  <a
                    href={inv.hostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    View
                  </a>
                ) : inv.invoicePdfUrl ? (
                  <a
                    href={inv.invoicePdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    PDF
                  </a>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
