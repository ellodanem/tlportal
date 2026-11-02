import { CustomerStatementForm } from "@/components/admin/customer-statement-form";
import { CustomerStatementPreview } from "@/components/admin/customer-statement-preview";
import { buildCustomerStatement, resolveStatementPeriod } from "@/lib/billing/customer-statement";

/**
 * Statement form and preview locked to one customer. Shared by the Subscriptions customer
 * workspace and the original Customers tab so the two cannot drift while both exist.
 */
export async function CustomerStatementsPanel({
  customerId,
  customerName,
  basePath,
  searchParams,
}: {
  customerId: string;
  customerName: string;
  /** Path the form submits to (GET), so the period stays in the URL of the page it was used on. */
  basePath: string;
  searchParams: { preset?: string; from?: string; to?: string };
}) {
  const period = resolveStatementPeriod(searchParams);
  const result = await buildCustomerStatement({ customerId, from: period.from, to: period.to });
  const statementError = "error" in result ? result.error : null;
  const statement = "error" in result ? null : result;

  return (
    <>
      <CustomerStatementForm
        customers={[]}
        lockedCustomerId={customerId}
        lockedCustomerName={customerName}
        basePath={basePath}
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
    </>
  );
}
