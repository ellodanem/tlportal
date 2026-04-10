import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerEditForm } from "@/components/customer-form";
import { DeleteCustomerButton } from "@/components/delete-customer-button";
import { SyncInvoilessButton } from "@/components/sync-invoiless-button";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

function displayName(c: {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  const co = c.company?.trim();
  if (co) return co;
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return person || "Customer";
}

export default async function EditCustomerPage({ params }: Props) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    notFound();
  }

  const invoilessConfigured = Boolean(process.env.INVOILESS_API_KEY?.trim());
  const title = displayName(customer);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/customers/${customer.id}`}
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← {title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Edit customer</h1>
        <p className="mt-1 font-mono text-xs text-zinc-500">{customer.id}</p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Invoiless</h2>
        {invoilessConfigured ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              {customer.invoilessCustomerId
                ? `Linked id: ${customer.invoilessCustomerId}. Push sends billing address (combined), legal info, notes, tags, and invoice Cc/Bcc.`
                : "Not linked yet. Sync will create the customer in Invoiless and store the id."}
            </p>
            <SyncInvoilessButton customerId={customer.id} hasInvoilessId={Boolean(customer.invoilessCustomerId)} />
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Set <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">INVOILESS_API_KEY</code> in the
            environment to enable sync.
          </p>
        )}
      </section>

      <CustomerEditForm customer={customer} />

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DeleteCustomerButton customerId={customer.id} />
      </div>
    </div>
  );
}
