import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerBillingAlerts } from "@/components/admin/customer-billing-alerts";
import { CustomerCollectionSummary } from "@/components/admin/customer-collection-summary";
import { CustomerBillingPanel } from "@/components/admin/customer-billing-panel";
import { PaymentRemindersSection } from "@/components/admin/payment-reminders-section";
import { CustomerPaymentDeclineFollowUpCard } from "@/components/admin/customer-payment-decline-follow-up";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { StripeInvoicesList } from "@/components/admin/stripe-invoices-list";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { loadCustomerBillingPageData } from "@/lib/admin/load-customer-billing";
import { loadCustomerCollectionSummary } from "@/lib/admin/load-customer-collection-summary";
import { formatMoney } from "@/lib/domain/native-billing";
import { buildPaymentDeclineEmailPreview } from "@/lib/stripe/payment-failure-messaging";
import { isTwilioWhatsAppConfigured } from "@/lib/twilio/config";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ stripe?: string; setup?: string; warn?: string }> };

function stripeBannerFromQuery(raw: string | undefined): "success" | "cancel" | null {
  return raw === "success" || raw === "cancel" ? raw : null;
}

type RecentInvoice = { id: string; number: string | null; status: string; amountDue: unknown; total: unknown; currency: string; issueDate: Date; dueDate: Date | null };

function InvoiceTable({ invoices }: { invoices: RecentInvoice[] }) {
  if (invoices.length === 0) return <p className="mt-4 text-sm text-zinc-500">No invoices have been recorded for this customer.</p>;
  return <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800"><tr><th className="px-2 py-2">Invoice</th><th className="px-2 py-2">Date</th><th className="px-2 py-2">Due</th><th className="px-2 py-2">Amount</th><th className="px-2 py-2">Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"><td className="px-2 py-3 font-medium text-emerald-700"><Link href={`/admin/tl-invoices/${invoice.id}`} className="hover:underline">{invoice.number ?? "Draft invoice"}</Link></td><td className="whitespace-nowrap px-2 py-3">{invoice.issueDate.toLocaleDateString(undefined, { dateStyle: "medium" })}</td><td className="whitespace-nowrap px-2 py-3">{invoice.dueDate?.toLocaleDateString(undefined, { dateStyle: "medium" }) ?? "—"}</td><td className="px-2 py-3 tabular-nums">{formatMoney(Number(invoice.total), invoice.currency)}</td><td className="px-2 py-3 capitalize">{invoice.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>;
}

export default async function CustomerBillingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { stripe: stripeQuery, setup: setupQuery, warn: warnQuery } = await searchParams;
  const data = await loadCustomerBillingPageData(id);
  if (!data) notFound();

  const [notificationDeliveries, collectionSummary, recentInvoices, recentPayments, recurringSchedule] = await Promise.all([
    prisma.billingNotificationDelivery.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, eventKind: true, channel: true, status: true, destination: true, attempts: true, lastError: true, sentAt: true, createdAt: true } }),
    loadCustomerCollectionSummary(id),
    prisma.invoice.findMany({ where: { customerId: id, archivedAt: null, billingInvoiceId: null }, orderBy: { issueDate: "desc" }, take: 5, select: { id: true, number: true, status: true, amountDue: true, total: true, currency: true, issueDate: true, dueDate: true } }),
    prisma.payment.findMany({ where: { customerId: id, voidedAt: null }, orderBy: { receivedAt: "desc" }, take: 5, select: { id: true, amount: true, currency: true, method: true, reference: true, receivedAt: true, invoice: { select: { id: true, number: true } } } }),
    prisma.recurringInvoiceSchedule.findFirst({ where: { customerId: id, status: { in: ["active", "paused"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, status: true, nextIssueDate: true, currency: true, lineItems: { select: { lineTotal: true } } } }),
  ]);
  const { customer, invoilessConfigured, stripeConfigured, invoilessId, billingSetup, stripeInvoices, paymentDeclineFollowUp, outstandingReminderCandidates, subscriptionSummary, renewalAssignments } = data;
  const title = customerDisplayName(customer);
  const primaryInvoice = recentInvoices.find((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status)) ?? recentInvoices[0] ?? null;
  const hasSubscriptions = Boolean(subscriptionSummary) || renewalAssignments.length > 0;
  const declineEmailPreview = paymentDeclineFollowUp ? buildPaymentDeclineEmailPreview({ greetingName: customer.firstName?.trim() || customer.company?.trim() || title, amountLabel: formatMoney(paymentDeclineFollowUp.amount, paymentDeclineFollowUp.currency), kind: paymentDeclineFollowUp.kind, invoiceNumber: paymentDeclineFollowUp.invoiceNumber, payUrl: paymentDeclineFollowUp.payUrl, declineCode: paymentDeclineFollowUp.declineCode }) : null;

  return <div className="flex flex-col gap-5">
    <header className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:px-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Customer · Financial activity and collection information.</p></div><Link href={`/admin/customers/${customer.id}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800">View customer →</Link></div><div className="mt-4"><CustomerSubnav customerId={customer.id} active="billing" /></div></header>
    <CustomerBillingAlerts billingMode={customer.billingMode} setupBanner={setupQuery === "1"} setupWarning={warnQuery ? decodeURIComponent(warnQuery) : null} stripeBanner={stripeBannerFromQuery(stripeQuery)} />
    {collectionSummary ? <CustomerCollectionSummary customerId={customer.id} summary={collectionSummary} primaryInvoice={primaryInvoice} hasSubscriptions={hasSubscriptions} reminderAvailable={outstandingReminderCandidates.length > 0} /> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)]"><div className="space-y-4"><section id="recent-invoices" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Recent invoices</h2><InvoiceTable invoices={recentInvoices} /></section><section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Recent payments</h2>{recentPayments.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No payments recorded yet.</p> : <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800"><tr><th className="px-2 py-2">Date</th><th className="px-2 py-2">Invoice</th><th className="px-2 py-2">Amount</th><th className="px-2 py-2">Method</th><th className="px-2 py-2">Reference</th></tr></thead><tbody>{recentPayments.map((payment) => <tr key={payment.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"><td className="whitespace-nowrap px-2 py-3">{payment.receivedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}</td><td className="px-2 py-3">{payment.invoice.number ?? "—"}</td><td className="px-2 py-3 tabular-nums">{formatMoney(Number(payment.amount), payment.currency)}</td><td className="px-2 py-3 capitalize">{payment.method.replaceAll("_", " ")}</td><td className="px-2 py-3">{payment.reference ?? "—"}</td></tr>)}</tbody></table></div>}</section></div><div className="space-y-4"><PaymentRemindersSection customerId={customer.id} customerName={title} greetingName={customer.firstName?.trim() || customer.company?.trim() || title} billingMode={customer.billingMode} paymentReminders={customer.paymentReminders} customerEmail={customer.email} customerPhone={customer.phone} whatsAppConfigured={isTwilioWhatsAppConfigured()} candidates={outstandingReminderCandidates} deliveries={notificationDeliveries} />{paymentDeclineFollowUp ? <CustomerPaymentDeclineFollowUpCard followUp={paymentDeclineFollowUp} customerId={customer.id} emailPreview={declineEmailPreview} whatsAppConfigured={isTwilioWhatsAppConfigured()} /> : null}</div></div>
    {hasSubscriptions ? <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Subscription billing</h2><p className="mt-1 text-sm text-zinc-500">{subscriptionSummary?.periodEndLabel ? `Current period ends ${subscriptionSummary.periodEndLabel}` : "Subscription and renewal details are managed separately."}</p></div><Link href={`/admin/customers/${customer.id}/subscriptions`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">View subscriptions →</Link></div></section> : null}
    {recurringSchedule ? <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Recurring invoice schedule</h2><p className="mt-1 text-sm text-zinc-500">{recurringSchedule.status === "active" ? "Active manual-collection schedule" : "Schedule is paused"} · Next invoice {recurringSchedule.nextIssueDate.toLocaleDateString(undefined, { dateStyle: "medium" })} · {formatMoney(recurringSchedule.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0), recurringSchedule.currency)}</p></div><Link href={`/admin/recurring-invoices/${recurringSchedule.id}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">Manage schedule →</Link></div></section> : null}
    <details className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><summary className="cursor-pointer text-base font-semibold text-zinc-900 dark:text-zinc-50">Advanced billing settings &amp; provider details</summary><div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800"><CustomerBillingPanel customerId={customer.id} billingMode={customer.billingMode} invoilessConfigured={invoilessConfigured} stripeConfigured={stripeConfigured} hasInvoilessId={Boolean(invoilessId)} billingSetup={billingSetup} />{customer.billingMode === "stripe_subscription" || stripeInvoices.length > 0 ? <section><h2 className="text-sm font-semibold">Provider invoices</h2><div className="mt-3"><StripeInvoicesList invoices={stripeInvoices} customerId={customer.id} customerEmail={customer.email} /></div></section> : null}</div></details>
  </div>;
}
