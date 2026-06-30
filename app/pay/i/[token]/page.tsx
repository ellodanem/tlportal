import { notFound } from "next/navigation";

import { InvoicePayOnlineForm } from "@/components/pay/invoice-pay-online-form";
import { loadInvoiceByPublicToken } from "@/lib/billing/invoice-from-db";
import { formatMoney, INVOICE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { isStripeBillingEnabled } from "@/lib/stripe/config";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-029", { day: "2-digit", month: "short", year: "numeric" });
}

const PAYABLE_STATUSES = new Set(["open", "partially_paid", "overdue"]);

export default async function PublicInvoicePayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;
  const invoice = await loadInvoiceByPublicToken(token);
  if (!invoice || invoice.status === "draft") notFound();

  const billTo =
    invoice.billToLines.length > 0 ? invoice.billToLines : [invoice.billToName ?? "Customer"];
  const isPaid = invoice.status === "paid";
  const isVoid = invoice.status === "void" || invoice.status === "written_off";
  const amountDue = Number(invoice.amountDue);
  const showPayOnline =
    invoice.allowOnlinePayment &&
    isStripeBillingEnabled() &&
    !isPaid &&
    !isVoid &&
    PAYABLE_STATUSES.has(invoice.status) &&
    amountDue > 0;
  const showPaidBanner = paid === "1" || isPaid;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Track Lucia
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{invoice.number ?? "Invoice"}</h1>
          <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium dark:bg-zinc-800">
            {INVOICE_STATUS_LABELS[invoice.status]}
          </span>
        </div>

        {paid === "1" && !isPaid && !isVoid ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-medium">Payment submitted</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
              Thank you — your card payment is being confirmed. Refresh this page in a moment if the status has not
              updated yet.
            </p>
          </div>
        ) : null}

        {showPaidBanner && isPaid ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            <p className="font-medium">Payment received — thank you.</p>
            <p className="mt-1 text-emerald-900/90 dark:text-emerald-200/90">
              This invoice is paid in full. A receipt may arrive by email from your card provider.
            </p>
          </div>
        ) : null}

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Invoice date</dt>
            <dd className="font-medium">{formatDate(invoice.issueDate)}</dd>
          </div>
          {invoice.dueDate ? (
            <div>
              <dt className="text-zinc-500">Due date</dt>
              <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Bill to</dt>
            <dd className="font-medium">
              {billTo.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </dd>
          </div>
        </dl>

        <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {invoice.lineItems.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3">{line.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(line.quantity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(Number(line.unitPrice), invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(Number(line.lineTotal), invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-zinc-200 px-4 py-4 text-right dark:border-zinc-800">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Total {formatMoney(Number(invoice.total), invoice.currency)}
            </p>
            {!isPaid && !isVoid ? (
              <p className="mt-1 text-lg font-semibold">
                Amount due {formatMoney(amountDue, invoice.currency)}
              </p>
            ) : null}
            {isPaid ? (
              <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">Paid in full</p>
            ) : null}
          </div>
        </div>

        {showPayOnline ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">Pay online</p>
            <p className="mt-1 text-sm text-emerald-900/90 dark:text-emerald-200/90">
              Pay the outstanding balance securely by card.
            </p>
            <div className="mt-4">
              <InvoicePayOnlineForm token={token} />
            </div>
          </div>
        ) : null}

        {invoice.paymentInstructions && !isPaid && !isVoid ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <p className="font-medium text-emerald-950 dark:text-emerald-100">How to pay</p>
            <p className="mt-2 whitespace-pre-wrap text-emerald-900/90 dark:text-emerald-200/90">
              {invoice.paymentInstructions}
            </p>
          </div>
        ) : null}

        {invoice.notes ? (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{invoice.notes}</p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-4">
          <a
            href={`/api/pay/i/${token}/pdf`}
            className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          >
            Download PDF
          </a>
        </div>

        <p className="mt-10 text-xs text-zinc-500">
          Questions? Reply to your invoice email or contact Track Lucia support.
        </p>
      </main>
    </div>
  );
}
