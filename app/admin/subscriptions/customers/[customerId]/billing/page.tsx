import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerBillingAlerts } from "@/components/admin/customer-billing-alerts";
import { CustomerCollectionSummary } from "@/components/admin/customer-collection-summary";
import { CustomerBillingPanel } from "@/components/admin/customer-billing-panel";
import { PaymentRemindersSection } from "@/components/admin/payment-reminders-section";
import { CustomerPaymentDeclineFollowUpCard } from "@/components/admin/customer-payment-decline-follow-up";
import { FinancialLedgerTable, FinancialPaymentsList } from "@/components/admin/financial-ledger-table";
import { StripeInvoicesList } from "@/components/admin/stripe-invoices-list";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { canonicalSubscriptionLinks } from "@/lib/admin/customer-subscription-links";
import { loadCustomerBillingPageData } from "@/lib/admin/load-customer-billing";
import { loadCustomerCollectionSummary } from "@/lib/admin/load-customer-collection-summary";
import { NOT_LINKED_LABEL } from "@/lib/domain/financial-ledger";
import { canonicalSubscriptionDisplayName, canonicalSubscriptionUiVisible } from "@/lib/domain/canonical-subscription-admin";
import { formatMoney } from "@/lib/domain/native-billing";
import { getCustomerFinancialLedger } from "@/lib/services/financial-ledger-service";
import { buildPaymentDeclineEmailPreview } from "@/lib/stripe/payment-failure-messaging";
import { getTwilioContentSid, isTwilioWhatsAppConfigured } from "@/lib/twilio/config";
import { prisma } from "@/lib/db";

type Props = { params: Promise<{ customerId: string }>; searchParams: Promise<{ stripe?: string; setup?: string; warn?: string }> };

function stripeBannerFromQuery(raw: string | undefined): "success" | "cancel" | null {
  return raw === "success" || raw === "cancel" ? raw : null;
}

export default async function CustomerBillingPage({ params, searchParams }: Props) {
  const { customerId: id } = await params;
  const { stripe: stripeQuery, setup: setupQuery, warn: warnQuery } = await searchParams;
  const data = await loadCustomerBillingPageData(id);
  if (!data) notFound();

  const [notificationDeliveries, collectionSummary, recentInvoices, recurringSchedule, ledger, subscriptionRows] = await Promise.all([
    prisma.billingNotificationDelivery.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, eventKind: true, channel: true, status: true, destination: true, attempts: true, lastError: true, sentAt: true, createdAt: true } }),
    loadCustomerCollectionSummary(id),
    prisma.invoice.findMany({ where: { customerId: id, archivedAt: null, billingInvoiceId: null }, orderBy: { issueDate: "desc" }, take: 5, select: { id: true, number: true, status: true, amountDue: true, total: true, currency: true, issueDate: true, dueDate: true } }),
    prisma.recurringInvoiceSchedule.findFirst({ where: { customerId: id, status: { in: ["active", "paused"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, status: true, nextIssueDate: true, currency: true, customerSubscriptionId: true, customerSubscription: { select: { name: true, billingIntervalMonths: true, lifecycleStatus: true } }, lineItems: { select: { lineTotal: true } } } }),
    getCustomerFinancialLedger(id),
    prisma.customerSubscription.findMany({ where: { customerId: id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, reference: true, billingIntervalMonths: true, lifecycleStatus: true, nextBillingDate: true } }),
  ]);
  const subscriptionLabels = Object.fromEntries(subscriptionRows.map((row) => [row.id, canonicalSubscriptionDisplayName(row.name, row.billingIntervalMonths)]));
  // Only canonical agreements have a subscription workspace to link to.
  const subscriptionLinks = canonicalSubscriptionLinks(subscriptionRows);
  // A schedule that belongs to a canonical subscription is derived from it. Cadence, services and
  // status are changed on the subscription, never in the generic schedule editor.
  const derivedScheduleSubscription = recurringSchedule?.customerSubscriptionId && recurringSchedule.customerSubscription?.lifecycleStatus != null && canonicalSubscriptionUiVisible()
    ? { id: recurringSchedule.customerSubscriptionId, label: canonicalSubscriptionDisplayName(recurringSchedule.customerSubscription.name, recurringSchedule.customerSubscription.billingIntervalMonths) }
    : null;
  const { customer, invoilessConfigured, stripeConfigured, invoilessId, billingSetup, stripeInvoices, paymentDeclineFollowUp, outstandingReminderCandidates, subscriptionSummary, renewalAssignments } = data;
  const title = customerDisplayName(customer);
  const hasSubscriptions = Boolean(subscriptionSummary) || renewalAssignments.length > 0;
  // A paid one-off (for example, hardware or installation) must not replace
  // the reconciled Stripe subscription invoice in the collection summary.
  // Subscription customers keep one-off balances in the invoice list instead.
  const primaryInvoice = hasSubscriptions
    ? null
    : recentInvoices.find((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status)) ?? null;
  const declineEmailPreview = paymentDeclineFollowUp ? buildPaymentDeclineEmailPreview({ greetingName: customer.firstName?.trim() || customer.company?.trim() || title, amountLabel: formatMoney(paymentDeclineFollowUp.amount, paymentDeclineFollowUp.currency), kind: paymentDeclineFollowUp.kind, invoiceNumber: paymentDeclineFollowUp.invoiceNumber, payUrl: paymentDeclineFollowUp.payUrl, declineCode: paymentDeclineFollowUp.declineCode }) : null;

  return <div className="flex flex-col gap-5">
    <CustomerBillingAlerts billingMode={customer.billingMode} setupBanner={setupQuery === "1"} setupWarning={warnQuery ? decodeURIComponent(warnQuery) : null} stripeBanner={stripeBannerFromQuery(stripeQuery)} />
    {collectionSummary ? <CustomerCollectionSummary customerId={customer.id} summary={collectionSummary} primaryInvoice={primaryInvoice} hasSubscriptions={hasSubscriptions} hasRecordedInvoices={ledger.rows.length > 0} reminderAvailable={outstandingReminderCandidates.length > 0} /> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.85fr)]"><div className="space-y-4"><section id="recent-invoices" className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-col gap-2 border-b border-zinc-100 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800"><div><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Invoices</h2><p className="mt-1 text-sm text-zinc-500">Every invoice for this customer, native and provider, once each. {ledger.unlinked.count > 0 ? `${ledger.unlinked.count} ${ledger.unlinked.count === 1 ? "is" : "are"} marked "${NOT_LINKED_LABEL}".` : ""}</p></div><Link href={`/admin/tl-invoices/new?customerId=${customer.id}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">Create invoice</Link></div><FinancialLedgerTable ledger={ledger} customerId={customer.id} showSubscription subscriptionLabels={subscriptionLabels} emptyMessage="No invoices have been recorded for this customer." /></section><section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"><h2 className="border-b border-zinc-100 p-4 text-base font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">Payments</h2><FinancialPaymentsList ledger={ledger} /></section></div><div className="space-y-4"><PaymentRemindersSection customerId={customer.id} customerName={title} greetingName={customer.firstName?.trim() || customer.company?.trim() || title} billingMode={customer.billingMode} paymentReminders={customer.paymentReminders} customerEmail={customer.email} customerPhone={customer.phone} whatsAppConfigured={isTwilioWhatsAppConfigured()} whatsAppTemplateConfigured={Boolean(getTwilioContentSid("outstanding_invoices"))} candidates={outstandingReminderCandidates} deliveries={notificationDeliveries} />{paymentDeclineFollowUp ? <CustomerPaymentDeclineFollowUpCard followUp={paymentDeclineFollowUp} customerId={customer.id} emailPreview={declineEmailPreview} whatsAppConfigured={isTwilioWhatsAppConfigured()} /> : null}</div></div>
    {subscriptionLinks.length ? <section id="subscription-billing" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Subscription billing</h2><p className="mt-1 text-sm text-zinc-500">Each subscription bills on its own schedule. Renewal, services and collection method are managed on the subscription.</p></div><ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">{subscriptionLinks.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{entry.label}</p><p className="text-xs text-zinc-500">{entry.interval}{entry.renews ? ` · renews ${entry.renews}` : ""}</p></div><Link href={`/admin/subscriptions/canonical/${entry.id}/billing`} className="inline-flex min-h-10 items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">Billing &amp; renewal →</Link></li>)}</ul></section> : hasSubscriptions ? <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Subscription billing</h2><p className="mt-1 text-sm text-zinc-500">{subscriptionSummary?.periodEndLabel ? `Current period ends ${subscriptionSummary.periodEndLabel}` : "Subscription and renewal details are managed separately."}</p></div><Link href={`/admin/subscriptions/${customer.id}/renewals`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">Manage renewals →</Link></div></section> : null}
    {recurringSchedule ? <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Recurring invoice schedule</h2><p className="mt-1 text-sm text-zinc-500">{recurringSchedule.status === "active" ? "Active manual-collection schedule" : "Schedule is paused"} · Next invoice {recurringSchedule.nextIssueDate.toLocaleDateString(undefined, { dateStyle: "medium" })} · {formatMoney(recurringSchedule.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0), recurringSchedule.currency)}{derivedScheduleSubscription ? ` · Derived from ${derivedScheduleSubscription.label}` : ""}</p></div>{derivedScheduleSubscription ? <Link href={`/admin/subscriptions/canonical/${derivedScheduleSubscription.id}/billing`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">Manage on subscription →</Link> : <Link href={`/admin/recurring-invoices/${recurringSchedule.id}`} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">Manage schedule →</Link>}</div></section> : null}
    <section id="billing-settings" className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Billing settings</h2><div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 dark:border-zinc-800"><CustomerBillingPanel customerId={customer.id} billingMode={customer.billingMode} invoilessConfigured={invoilessConfigured} stripeConfigured={stripeConfigured} hasInvoilessId={Boolean(invoilessId)} billingSetup={billingSetup} />{customer.billingMode === "stripe_subscription" || stripeInvoices.length > 0 ? <section id="provider-invoices"><h2 className="text-sm font-semibold">Provider invoices</h2><div className="mt-3"><StripeInvoicesList invoices={stripeInvoices} customerId={customer.id} customerEmail={customer.email} /></div></section> : null}</div></section>
  </div>;
}
