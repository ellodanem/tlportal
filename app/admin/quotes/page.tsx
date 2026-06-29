import { QuoteGeneratorForm, type QuoteCustomerOption } from "@/components/admin/quote-generator-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { suggestQuoteNumber } from "@/lib/billing/quote-pdf";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { prisma } from "@/lib/db";

export default async function AdminQuotesPage() {
  const customers = await prisma.customer.findMany({
    where: activeCustomerWhere,
    orderBy: [{ company: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      company: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
    },
  });

  const customerOptions: QuoteCustomerOption[] = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    email: c.email?.trim() || null,
    billToLines: customerBillToLines(c),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Quick quote</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Quick quote</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Build a one-page PDF estimate when Invoiless is unavailable. Pick a customer (or type a name), set line items,
          then download or email — SMTP must be configured under Settings.
        </p>
      </div>

      <QuoteGeneratorForm customers={customerOptions} defaultQuoteNumber={suggestQuoteNumber()} />
    </div>
  );
}
