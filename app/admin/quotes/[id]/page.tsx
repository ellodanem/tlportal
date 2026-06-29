import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteConvertForm } from "@/components/admin/quote-convert-form";
import { QuoteGeneratorForm, type QuoteCustomerOption, type QuoteFormInitial } from "@/components/admin/quote-generator-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { formatMoney, QUOTE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [quote, customers] = await Promise.all([
    prisma.quote.findUnique({
      where: { id },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        convertedInvoice: {
          select: { id: true, number: true, status: true, total: true, currency: true },
        },
      },
    }),
    prisma.customer.findMany({
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
    }),
  ]);

  if (!quote) notFound();

  const customerOptions: QuoteCustomerOption[] = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    email: c.email?.trim() || null,
    billToLines: customerBillToLines(c),
  }));

  const initial: QuoteFormInitial = {
    quoteId: quote.id,
    status: quote.status,
    number: quote.number,
    customerId: quote.customerId,
    clientName: quote.customerId ? "" : (quote.billToName ?? ""),
    quoteDate: formatYmd(quote.issueDate),
    validUntil: quote.validUntil ? formatYmd(quote.validUntil) : formatYmd(quote.issueDate),
    currency: quote.currency,
    notes: quote.notes ?? "",
    lines: quote.lineItems.map((line) => ({
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
    })),
    convertedInvoiceId: quote.convertedInvoiceId,
  };

  const readOnly = quote.status !== "draft";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/quotes" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Quotes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {quote.number ?? "Draft quote"}
          </h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {QUOTE_STATUS_LABELS[quote.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Total {formatMoney(Number(quote.total), quote.currency)}
          {quote.sentAt
            ? ` · Sent ${quote.sentAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
            : ""}
        </p>
      </div>

      {quote.convertedInvoice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-medium">Converted to draft invoice</p>
          <p className="mt-1 text-emerald-900/90 dark:text-emerald-200/90">
            Invoice {quote.convertedInvoice.number ?? quote.convertedInvoice.id.slice(0, 8)} —{" "}
            {formatMoney(Number(quote.convertedInvoice.total), quote.convertedInvoice.currency)} ({quote.convertedInvoice.status.replace("_", " ")}).
            Native invoice admin UI ships in Phase 2.
          </p>
        </div>
      ) : quote.status !== "converted" && quote.status !== "declined" ? (
        <QuoteConvertForm quoteId={quote.id} />
      ) : null}

      <QuoteGeneratorForm
        customers={customerOptions}
        initial={initial}
        readOnly={readOnly}
      />
    </div>
  );
}
