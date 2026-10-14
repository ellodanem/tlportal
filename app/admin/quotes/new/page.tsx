import { QuoteGeneratorForm, type QuoteCustomerOption } from "@/components/admin/quote-generator-form";
import { CommercialCreateShell } from "@/components/admin/commercial-create-shell";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { prisma } from "@/lib/db";

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const { customerId } = await searchParams;
  const customers = await prisma.customer.findMany({ where: activeCustomerWhere, orderBy: [{ company: "asc" }, { lastName: "asc" }], select: { id: true, company: true, firstName: true, lastName: true, email: true, phone: true, address: true, city: true, state: true, postalCode: true, country: true } });
  const customerOptions: QuoteCustomerOption[] = customers.map((c) => ({ id: c.id, label: customerDisplayName(c), email: c.email?.trim() || null, billToLines: customerBillToLines(c) }));
  return <CommercialCreateShell backHref="/admin/quotes" backLabel="Quotes" eyebrow="Sales / Quotes" title="New quote" description="Build a fleet estimate, save it as a draft, then download or email." panelTitle="Shape the opportunity" panelDescription="Start with the customer and scope, then turn the estimate into an invoice when the work is approved." panelItems={[{ label: "Best for", value: "Pre-sale estimates" }, { label: "Included", value: "Line items and pricing" }, { label: "Next step", value: "Send or convert to invoice" }]}><QuoteGeneratorForm customers={customerOptions} initialCustomerId={customerId ?? null} /></CommercialCreateShell>;
}
