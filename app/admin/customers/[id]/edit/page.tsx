import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerEditForm } from "@/components/customer-form";
import { DeleteCustomerButton } from "@/components/delete-customer-button";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function EditCustomerPage({ params }: Props) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    notFound();
  }

  const title = customerDisplayName(customer);

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

      <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
        Billing, Stripe subscriptions, and payment links are on the{" "}
        <Link
          href={`/admin/customers/${customer.id}/billing`}
          className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Billing tab
        </Link>
        .
      </p>

      <CustomerEditForm customer={customer} />

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DeleteCustomerButton customerId={customer.id} />
      </div>
    </div>
  );
}
