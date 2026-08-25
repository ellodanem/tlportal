import Link from "next/link";

import { CustomerStatementForm } from "@/components/admin/customer-statement-form";
import { CustomerStatementPreview } from "@/components/admin/customer-statement-preview";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { buildCustomerStatement, resolveStatementPeriod } from "@/lib/billing/customer-statement";
import { prisma } from "@/lib/db";

type Props = {
  searchParams: Promise<{
    customerId?: string;
    preset?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function AdminStatementsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const period = resolveStatementPeriod(sp);
  const customerId = sp.customerId?.trim() ?? "";

  const customers = await prisma.customer.findMany({
    where: activeCustomerWhere,
    orderBy: [{ company: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, company: true, firstName: true, lastName: true },
  });

  const customerOptions = customers.map((c) => ({
    id: c.id,
    name: customerDisplayName(c),
  }));

  let statement = null;
  let statementError: string | null = null;

  if (customerId) {
    const result = await buildCustomerStatement({
      customerId,
      from: period.from,
      to: period.to,
    });
    if ("error" in result) {
      statementError = result.error;
    } else {
      statement = result;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Billing</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Statements</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Customer statements
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Generate an account statement for a customer over a date range — opening balance, activity, and outstanding
          invoices.
        </p>
      </div>

      <CustomerStatementForm
        customers={customerOptions}
        basePath="/admin/statements"
        initialPreset={period.preset}
        initialFrom={period.from}
        initialTo={period.to}
        initialCustomerId={customerId || undefined}
      />

      {statementError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {statementError}
        </p>
      ) : null}

      {statement ? <CustomerStatementPreview statement={statement} /> : null}

      {!customerId ? (
        <p className="text-sm text-zinc-500">Select a customer and period, then choose Generate preview.</p>
      ) : null}
    </div>
  );
}
