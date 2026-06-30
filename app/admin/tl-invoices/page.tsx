import Link from "next/link";

import { customerDisplayName } from "@/lib/admin/customer-display";
import { displayInvoiceNumber, isNativeBillingPrimary } from "@/lib/domain/native-billing-cutover";
import { formatMoney, INVOICE_KIND_LABELS, INVOICE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

function invoiceClientLabel(row: {
  number: string | null;
  billToName: string | null;
  customer: { company: string | null; firstName: string | null; lastName: string | null } | null;
}): string {
  if (row.billToName?.trim()) return row.billToName.trim();
  if (row.customer) return customerDisplayName(row.customer);
  return "—";
}

export default async function AdminTlInvoicesPage() {
  const nativePrimary = isNativeBillingPrimary();
  const pageTitle = nativePrimary ? "Invoices" : "TL invoices";

  const invoices = await prisma.invoice.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      number: true,
      legacyInvoiceNumber: true,
      kind: true,
      status: true,
      billToName: true,
      total: true,
      amountDue: true,
      currency: true,
      issueDate: true,
      dueDate: true,
      updatedAt: true,
      customer: {
        select: { company: true, firstName: true, lastName: true },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
            <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
            <span className="text-zinc-700 dark:text-zinc-300">{pageTitle}</span>
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{pageTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Unified AR — one-off, recurring, imported history, and Stripe subscription mirrors. Cash/cheque payers get
            native invoices; card subscriptions sync from Stripe automatically.
          </p>
        </div>
        <Link
          href="/admin/tl-invoices/new"
          className="inline-flex justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          New invoice
        </Link>
      </div>

      {invoices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          No invoices yet. Create one for hardware, installation, or other one-off charges — convert an accepted quote,
          or{" "}
          <Link href="/admin/billing-cutover" className="font-medium text-emerald-700 underline dark:text-emerald-400">
            import from Invoiless
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {invoices.map((inv) => (
                <tr key={inv.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-4 py-3 font-medium">
                    {displayInvoiceNumber(inv) === "—" && inv.status === "draft"
                      ? "Draft"
                      : displayInvoiceNumber(inv)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{INVOICE_KIND_LABELS[inv.kind]}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{invoiceClientLabel(inv)}</td>
                  <td className="px-4 py-3">{INVOICE_STATUS_LABELS[inv.status]}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(Number(inv.total), inv.currency)}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                    {inv.status === "draft"
                      ? "—"
                      : formatMoney(Number(inv.amountDue), inv.currency)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {inv.updatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/tl-invoices/${inv.id}`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Open
                    </Link>
                    {inv.number || inv.legacyInvoiceNumber ? (
                      <>
                        <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
                        <a
                          href={`/api/admin/tl-invoices/${inv.id}/pdf`}
                          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                          PDF
                        </a>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
