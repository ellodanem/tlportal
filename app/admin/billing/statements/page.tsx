import { BillingWorkspaceHeader } from "@/components/admin/billing-workspace";
import { CustomerStatementForm } from "@/components/admin/customer-statement-form";
import { CustomerStatementPreview } from "@/components/admin/customer-statement-preview";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { buildCustomerStatement, resolveStatementPeriod } from "@/lib/billing/customer-statement";
import { prisma } from "@/lib/db";

export default async function BillingStatementsPage({ searchParams }: { searchParams: Promise<{ customerId?: string; preset?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const period = resolveStatementPeriod(params);
  const customerId = params.customerId?.trim() ?? "";
  const customers = await prisma.customer.findMany({ where: activeCustomerWhere, orderBy: [{ company: "asc" }, { lastName: "asc" }, { firstName: "asc" }], select: { id: true, company: true, firstName: true, lastName: true } });
  const result = customerId ? await buildCustomerStatement({ customerId, from: period.from, to: period.to }) : null;
  const error = result && "error" in result ? result.error : null;
  const statement = result && !("error" in result) ? result : null;

  return <div className="flex flex-col gap-6">
    <BillingWorkspaceHeader active="statements" title="Customer statements" subtitle="Generate and download customer statements." />
    <CustomerStatementForm customers={customers.map((customer) => ({ id: customer.id, name: customerDisplayName(customer) }))} basePath="/admin/billing/statements" initialPreset={period.preset} initialFrom={period.from} initialTo={period.to} initialCustomerId={customerId || undefined} />
    {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null}
    {statement ? <CustomerStatementPreview statement={statement} /> : null}
    {!customerId ? <p className="text-sm text-zinc-500">Select a customer and period, then generate a preview.</p> : null}
  </div>;
}
