import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InvoiceEditForm } from "@/components/admin/invoices/invoice-edit-form";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { prisma } from "@/lib/db";
import { fetchInvoilessInvoiceForEdit } from "@/lib/invoiless/invoice-mutate";
import { isInvoilessConfigured } from "@/lib/invoiless/invoices-list";

type Props = { params: Promise<{ id: string }> };

export default async function EditInvoicePage({ params }: Props) {
  if (!isInvoilessConfigured()) {
    redirect("/admin/invoices");
  }

  const { id } = await params;
  const invoiceId = decodeURIComponent(id).trim();
  if (!invoiceId) {
    notFound();
  }

  let data;
  try {
    data = await fetchInvoilessInvoiceForEdit(invoiceId);
  } catch {
    notFound();
  }

  const tl =
    data.invoilessCustomerId != null
      ? await prisma.customer.findFirst({
          where: { invoilessCustomerId: data.invoilessCustomerId },
          select: { id: true, company: true, firstName: true, lastName: true },
        })
      : null;

  const customerLabel = tl
    ? customerDisplayName(tl)
    : data.invoilessCustomerId
      ? `Invoiless customer ${data.invoilessCustomerId}`
      : "Unknown customer";

  const titleLabel = data.number?.trim() || data.id;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <Link href="/admin/invoices" className="text-emerald-700 hover:underline dark:text-emerald-400">
            Invoices
          </Link>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Edit</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit invoice {titleLabel}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Changes are saved to Invoiless via API. Currency and invoice number stay as set in Invoiless unless you
          change them there.
        </p>
      </div>

      {!data.invoilessCustomerId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Missing customer on this invoice</p>
          <p className="mt-1">
            TL Portal could not read an Invoiless customer id for this invoice. Edit it in the Invoiless app, or
            contact support if the API payload changed.
          </p>
        </div>
      ) : (
        <InvoiceEditForm
          invoiceId={data.id}
          invoilessCustomerId={data.invoilessCustomerId}
          customerLabel={customerLabel}
          initialItems={data.items}
          initialStatus={data.status}
          initialInvoiceDate={data.invoiceDateInput}
          initialDueDate={data.dueDateInput}
          initialNotes={data.notes}
          initialIsRetainer={data.isRetainer}
          initialIsRecurring={data.isRecurring}
        />
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/admin/invoices" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Invoice list
        </Link>
      </p>
    </div>
  );
}
