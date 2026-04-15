import Link from "next/link";
import { redirect } from "next/navigation";

import { InvoiceCreateForm } from "@/components/admin/invoices/invoice-create-form";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { prisma } from "@/lib/db";
import { isInvoilessConfigured } from "@/lib/invoiless/invoices-list";

export default async function NewInvoicePage() {
  if (!isInvoilessConfigured()) {
    redirect("/admin/invoices");
  }

  const customers = await prisma.customer.findMany({
    where: { invoilessCustomerId: { not: null } },
    select: { id: true, company: true, firstName: true, lastName: true },
    orderBy: [{ company: "asc" }, { lastName: "asc" }],
  });

  const options = customers.map((c) => ({
    id: c.id,
    name: customerDisplayName(c),
  }));

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
          <span className="text-zinc-700 dark:text-zinc-300">New</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">New invoice</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Creates the invoice in Invoiless via API (same workspace as your API key). Currency follows{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">INVOILESS_DEFAULT_CURRENCY</code> or
          XCD.
        </p>
      </div>

      {options.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">No linked customers</p>
          <p className="mt-1">
            Sync at least one customer to Invoiless, then return here.{" "}
            <Link href="/admin/customers" className="font-semibold underline underline-offset-2">
              Customers
            </Link>
          </p>
        </div>
      ) : (
        <InvoiceCreateForm customers={options} />
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/admin/invoices" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Invoice list
        </Link>
      </p>
    </div>
  );
}
