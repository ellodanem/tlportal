import Link from "next/link";

import { QuoteGeneratorForm, type QuoteCustomerOption } from "@/components/admin/quote-generator-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { prisma } from "@/lib/db";

export default async function NewQuotePage() {
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
        <Link href="/admin/quotes" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Quotes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">New quote</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Build a fleet estimate, save it as a draft, then download or email. A TL-Q number is assigned when you send.
        </p>
      </div>

      <QuoteGeneratorForm customers={customerOptions} />
    </div>
  );
}
