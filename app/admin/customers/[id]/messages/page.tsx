import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerMessagesPanel } from "@/components/admin/customer-messages-panel";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }> };

export default async function CustomerMessagesPage({ params }: Props) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, company: true, firstName: true, lastName: true, phone: true },
  });
  if (!customer) notFound();

  const title = customerDisplayName(customer);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">WhatsApp messages</p>
      </div>

      <CustomerSubnav customerId={customer.id} active="messages" />
      <CustomerMessagesPanel customer={customer} />
    </div>
  );
}
