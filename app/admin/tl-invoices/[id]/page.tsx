import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveInvoiceButton, UnarchiveInvoiceButton } from "@/components/admin/archive-invoice-button";
import { InvoiceDeclineFollowUpBanner } from "@/components/admin/invoice-decline-follow-up-banner";
import { StripeSubscriptionInvoicePanel } from "@/components/admin/stripe-subscription-invoice-panel";
import { InvoiceAddChargesPanel } from "@/components/admin/invoice-add-charges-panel";
import { canAppendChargesToInvoice } from "@/lib/services/native-invoice-service";
import { InvoiceScheduledEmailBanner } from "@/components/admin/invoice-scheduled-email-banner";
import {
  InvoiceGeneratorForm,
  type InvoiceCustomerOption,
  type InvoiceFormInitial,
} from "@/components/admin/invoice-generator-form";
import { InvoiceDeleteForm, InvoicePaymentForm, InvoiceVoidForm } from "@/components/admin/invoice-payment-form";
import { activeCustomerWhere } from "@/lib/admin/active-customer-filter";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { displayInvoiceNumber } from "@/lib/domain/native-billing-cutover";
import { formatMoney, INVOICE_KIND_LABELS, INVOICE_STATUS_LABELS, invoiceStatusBadgeClass, PAYMENT_METHOD_LABELS } from "@/lib/domain/native-billing";
import { prisma } from "@/lib/db";
import { isStripeBillingEnabled } from "@/lib/stripe/config";
import { getAppBaseUrl } from "@/lib/stripe/app-url";
import { getNativeInvoiceDeclineFollowUp } from "@/lib/stripe/payment-failure-recovery";

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function TlInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [invoice, customers, pendingScheduledEmail, declineFollowUp] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { where: { voidedAt: null }, orderBy: { receivedAt: "desc" } },
        sourceQuote: { select: { id: true, number: true } },
        recurringSchedule: { select: { id: true, name: true, status: true, customerSubscriptionId: true, customerSubscription: { select: { lifecycleStatus: true } } } },
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
    prisma.scheduledInvoiceEmail.findFirst({
      where: { invoiceId: id, status: "pending" },
      select: { sendAt: true, to: true },
    }),
    getNativeInvoiceDeclineFollowUp(id),
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
    allowOnlinePayment: invoice.allowOnlinePayment,
    discountAmount: Number(invoice.discountTotal),
    amountDue: Number(invoice.amountDue),
    lines: invoice.lineItems.map((line) => ({
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
    })),
  };

  const isStripeMirror = invoice.kind === "subscription_mirror";
  const isArchived = Boolean(invoice.archivedAt);
  const displayNumber = displayInvoiceNumber(invoice);
  const heading =
    displayNumber === "—" && invoice.status === "draft" ? "Draft invoice" : displayNumber;
  const readOnly = invoice.status !== "draft" || isStripeMirror;
  const publicPayUrl =
    !isStripeMirror && invoice.publicToken && invoice.status !== "draft"
      ? `${getAppBaseUrl()}/pay/i/${invoice.publicToken}`
      : null;

  // A schedule derived from a canonical subscription is managed on that subscription.
  const recurringScheduleHref = invoice.recurringSchedule
    ? invoice.recurringSchedule.customerSubscriptionId &&
      invoice.recurringSchedule.customerSubscription?.lifecycleStatus != null &&
      canonicalSubscriptionUiVisible()
      ? `/admin/subscriptions/canonical/${invoice.recurringSchedule.customerSubscriptionId}/billing`
      : `/admin/recurring-invoices/${invoice.recurringSchedule.id}`
    : "#";

  const canRecordPayment =
    !isArchived &&
    !isStripeMirror &&
    (invoice.status === "open" || invoice.status === "partially_paid" || invoice.status === "overdue");
  const canAddCharges = canAppendChargesToInvoice({
    status: invoice.status,
    kind: invoice.kind,
    archivedAt: invoice.archivedAt,
  });
  const canVoid =
    !isArchived &&
    !isStripeMirror &&
    (invoice.status === "open" || invoice.status === "partially_paid" || invoice.status === "overdue" || invoice.status === "paid");

  return (
    <div className="flex flex-col gap-8">
      {isArchived ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              <strong>Archived</strong>
              {invoice.archivedAt
                ? ` since ${invoice.archivedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}`
                : ""}{" "}
              — hidden from the invoice list, AR aging, and billing reminders.
            </p>
            <UnarchiveInvoiceButton invoiceId={invoice.id} displayNumber={heading} />
          </div>
        </div>
      ) : null}
      <div>
        <Link
          href={isArchived ? "/admin/tl-invoices?view=archived" : "/admin/tl-invoices"}
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          {isArchived ? "← Archived invoices" : "← TL invoices"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {heading}
          </h1>
          <span className={invoiceStatusBadgeClass(invoice.status)}>
            {INVOICE_STATUS_LABELS[invoice.status]}
          </span>
          {isArchived ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
              Archived
            </span>
          ) : null}
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
        {invoice.recurringSchedule || invoice.sourceQuote ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
            {invoice.recurringSchedule ? (
              <span>
                From recurring schedule{" "}
                <Link href={recurringScheduleHref} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  {invoice.recurringSchedule.name?.trim() || "Recurring schedule"}
                </Link>
              </span>
            ) : null}
            {invoice.recurringSchedule && invoice.sourceQuote ? <span aria-hidden>·</span> : null}
            {invoice.sourceQuote ? (
              <span>
                From quote{" "}
                <Link href={`/admin/quotes/${invoice.sourceQuote.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  {invoice.sourceQuote.number ?? "Quote"}
                </Link>
              </span>
            ) : null}
          </p>
        ) : null}
        {canRecordPayment || canAddCharges ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {canRecordPayment ? (
              <InvoicePaymentForm
                invoiceId={invoice.id}
                amountDue={Number(invoice.amountDue)}
                currency={invoice.currency}
              />
            ) : null}
            {canAddCharges ? (
              <InvoiceAddChargesPanel
                invoiceId={invoice.id}
                currency={invoice.currency}
                allowOnlinePayment={invoice.allowOnlinePayment}
                stripeConfigured={isStripeBillingEnabled()}
                hasPayments={invoice.payments.length > 0}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {pendingScheduledEmail ? (
        <InvoiceScheduledEmailBanner
          invoiceId={invoice.id}
          sendAtIso={pendingScheduledEmail.sendAt.toISOString()}
          to={pendingScheduledEmail.to}
        />
      ) : null}

      {declineFollowUp &&
      !isArchived &&
      invoice.status !== "paid" &&
      invoice.status !== "void" &&
      invoice.status !== "written_off" ? (
        <InvoiceDeclineFollowUpBanner followUp={declineFollowUp} />
      ) : null}

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

      {invoice.status === "draft" && !isStripeMirror ? (<InvoiceDeleteForm invoiceId={invoice.id} displayNumber={heading} />) : canVoid ? (<InvoiceVoidForm invoiceId={invoice.id} />) : null}

      {!isArchived ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Hide from lists</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Archive this invoice if the customer churned or you no longer need it in AR. You can restore it later.
            {isStripeMirror
              ? " This does not void or write off the invoice in Stripe."
              : ""}
          </p>
          <div className="mt-3">
            <ArchiveInvoiceButton
              invoiceId={invoice.id}
              displayNumber={heading}
              isStripeMirror={isStripeMirror}
            />
          </div>
        </div>
      ) : null}

      {!isStripeMirror ? (
        <InvoiceGeneratorForm
          // The form seeds its state from `initial`; remount when lines/totals change (e.g. charges added).
          key={`${invoice.lineItems.length}-${invoice.total}-${invoice.allowOnlinePayment}`}
          customers={customerOptions}
          initial={initial}
          readOnly={readOnly}
          publicPayUrl={publicPayUrl}
          stripeConfigured={isStripeBillingEnabled()}
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
