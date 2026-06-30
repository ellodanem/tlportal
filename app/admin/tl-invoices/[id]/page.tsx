import Link from "next/link";
import { notFound } from "next/navigation";

import { StripeSubscriptionInvoicePanel } from "@/components/admin/stripe-subscription-invoice-panel";
import {
  InvoiceGeneratorForm,
  type InvoiceCustomerOption,
  type InvoiceFormInitial,
} from "@/components/admin/invoice-generator-form";
import { InvoicePaymentForm, InvoiceVoidForm } from "@/components/admin/invoice-payment-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { formatMoney, INVOICE_KIND_LABELS, INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/stripe/app-url";

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function TlInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [invoice, customers] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { where: { voidedAt: null }, orderBy: { receivedAt: "desc" } },
        sourceQuote: { select: { id: true, number: true } },
        recurringSchedule: { select: { id: true, name: true, status: true } },
        billingInvoice: {
          select: {
            id: true,
            externalInvoiceId: true,
            providerInvoiceNumber: true,
            hostedInvoiceUrl: true,
            invoicePdfUrl: true,
            customerId: true,
          },
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

  if (!invoice) notFound();

  const customerOptions: InvoiceCustomerOption[] = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    email: c.email?.trim() || null,
    billToLines: customerBillToLines(c),
  }));

  const initial: InvoiceFormInitial = {
    invoiceId: invoice.id,
    status: invoice.status,
    number: invoice.number,
    publicToken: invoice.publicToken,
    customerId: invoice.customerId,
    clientName: invoice.customerId ? "" : (invoice.billToName ?? ""),
    issueDate: formatYmd(invoice.issueDate),
    dueDate: invoice.dueDate ? formatYmd(invoice.dueDate) : formatYmd(invoice.issueDate),
    currency: invoice.currency,
    notes: invoice.notes ?? "",
    paymentInstructions: invoice.paymentInstructions ?? "",
    amountDue: Number(invoice.amountDue),
    lines: invoice.lineItems.map((line) => ({
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
    })),
  };

  const isStripeMirror = invoice.kind === "subscription_mirror";
  const readOnly = invoice.status !== "draft" || isStripeMirror;
  const publicPayUrl =
    !isStripeMirror && invoice.publicToken && invoice.status !== "draft"
      ? `${getAppBaseUrl()}/pay/i/${invoice.publicToken}`
      : null;

  const canRecordPayment =
    !isStripeMirror &&
    (invoice.status === "open" || invoice.status === "partially_paid" || invoice.status === "overdue");
  const canVoid =
    !isStripeMirror &&
    (invoice.status === "draft" || invoice.status === "open" || invoice.status === "partially_paid");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/tl-invoices"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← TL invoices
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {invoice.number ?? "Draft invoice"}
          </h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {INVOICE_STATUS_LABELS[invoice.status]}
          </span>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {INVOICE_KIND_LABELS[invoice.kind]}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Total {formatMoney(Number(invoice.total), invoice.currency)}
          {Number(invoice.amountDue) > 0 && invoice.status !== "draft"
            ? ` · ${formatMoney(Number(invoice.amountDue), invoice.currency)} due`
            : ""}
          {invoice.sentAt
            ? ` · Sent ${invoice.sentAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
            : ""}
        </p>
      </div>

      {invoice.billingInvoice ? (
        <StripeSubscriptionInvoicePanel
          billingInvoiceId={invoice.billingInvoice.id}
          customerId={invoice.billingInvoice.customerId}
          hostedInvoiceUrl={invoice.billingInvoice.hostedInvoiceUrl}
          invoicePdfUrl={invoice.billingInvoice.invoicePdfUrl}
          stripeExternalId={invoice.billingInvoice.externalInvoiceId}
          providerInvoiceNumber={invoice.billingInvoice.providerInvoiceNumber}
        />
      ) : null}

      {invoice.recurringSchedule ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">From recurring schedule</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            <Link
              href={`/admin/recurring-invoices/${invoice.recurringSchedule.id}`}
              className="text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {invoice.recurringSchedule.name?.trim() || "Recurring schedule"}
            </Link>
          </p>
        </div>
      ) : null}

      {invoice.sourceQuote ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">From quote</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            <Link href={`/admin/quotes/${invoice.sourceQuote.id}`} className="text-emerald-700 hover:underline dark:text-emerald-400">
              {invoice.sourceQuote.number ?? "Quote"}
            </Link>
          </p>
        </div>
      ) : null}

      {canRecordPayment ? (
        <InvoicePaymentForm
          invoiceId={invoice.id}
          amountDue={Number(invoice.amountDue)}
          currency={invoice.currency}
        />
      ) : null}

      {invoice.payments.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium">Payments</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 text-zinc-700 dark:text-zinc-300">
                <span>
                  {formatMoney(Number(p.amount), p.currency)} · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="text-zinc-500">
                  {p.receivedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canVoid ? <InvoiceVoidForm invoiceId={invoice.id} /> : null}

      {!isStripeMirror ? (
        <InvoiceGeneratorForm
          customers={customerOptions}
          initial={initial}
          readOnly={readOnly}
          publicPayUrl={publicPayUrl}
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-medium">Line items</p>
          <ul className="mt-3 flex flex-col gap-2">
            {invoice.lineItems.map((line) => (
              <li key={line.id} className="flex justify-between gap-4">
                <span>{line.description}</span>
                <span className="tabular-nums">
                  {formatMoney(Number(line.lineTotal), invoice.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
