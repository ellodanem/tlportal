import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerStatementForm } from "@/components/admin/customer-statement-form";
import { CustomerStatementPreview } from "@/components/admin/customer-statement-preview";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { buildCustomerStatement, resolveStatementPeriod } from "@/lib/billing/customer-statement";
import { prisma } from "@/lib/db";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function CustomerStatementsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const period = resolveStatementPeriod(sp);

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      archivedAt: true,
    },
  });
  if (!customer || customer.archivedAt) {
    notFound();
  }

  const title = customerDisplayName(customer);
  const result = await buildCustomerStatement({
    customerId: id,
    from: period.from,
    to: period.to,
  });
  const statementError = "error" in result ? result.error : null;
  const statement = "error" in result ? null : result;

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
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Statements</p>
      </div>

      <CustomerSubnav customerId={customer.id} active="statements" />

      <CustomerStatementForm
        customers={[]}
        lockedCustomerId={customer.id}
        lockedCustomerName={title}
        basePath={`/admin/customers/${customer.id}/statements`}
        initialPreset={period.preset}
        initialFrom={period.from}
        initialTo={period.to}
      />

      {statementError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {statementError}
        </p>
      ) : null}

      {statement ? <CustomerStatementPreview statement={statement} /> : null}
    </div>
  );
}
