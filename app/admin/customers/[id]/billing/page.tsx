import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerBillingAlerts } from "@/components/admin/customer-billing-alerts";
import { BillingNotificationHistory } from "@/components/admin/billing-notification-history";
import { CustomerBillingPanel } from "@/components/admin/customer-billing-panel";
import { PaymentRemindersSection } from "@/components/admin/payment-reminders-section";
import { CustomerPaymentDeclineFollowUpCard } from "@/components/admin/customer-payment-decline-follow-up";
import { CustomerSubnav } from "@/components/admin/customer-subnav";
import { StripeInvoicesList } from "@/components/admin/stripe-invoices-list";
import { customerDisplayName } from "@/lib/admin/customer-display";
import { loadCustomerBillingPageData } from "@/lib/admin/load-customer-billing";
import { formatMoney } from "@/lib/domain/native-billing";
import { buildPaymentDeclineEmailPreview } from "@/lib/stripe/payment-failure-messaging";
import { isTwilioWhatsAppConfigured } from "@/lib/twilio/config";
import { prisma } from "@/lib/db";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stripe?: string; setup?: string; warn?: string }>;
};

function stripeBannerFromQuery(raw: string | undefined): "success" | "cancel" | null {
  if (raw === "success") return "success";
  if (raw === "cancel") return "cancel";
  return null;
}

export default async function CustomerBillingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { stripe: stripeQuery, setup: setupQuery, warn: warnQuery } = await searchParams;
  const setupWarning = warnQuery ? decodeURIComponent(warnQuery) : null;
  const data = await loadCustomerBillingPageData(id);
  if (!data) {
    notFound();
  }
  const notificationDeliveries = await prisma.billingNotificationDelivery.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, eventKind: true, channel: true, status: true, destination: true, attempts: true, lastError: true },
  });

  const {
    customer,
    invoilessConfigured,
    stripeConfigured,
    invoilessId,
    billingSetup,
    stripeInvoices,
    paymentDeclineFollowUp,
    outstandingReminderCandidates,
  } = data;

  const title = customerDisplayName(customer);
  const stripeBanner = stripeBannerFromQuery(stripeQuery);
  const declineEmailPreview = paymentDeclineFollowUp
    ? buildPaymentDeclineEmailPreview({
        greetingName: title,
        amountLabel: formatMoney(paymentDeclineFollowUp.amount, paymentDeclineFollowUp.currency),
        kind: paymentDeclineFollowUp.kind,
        invoiceNumber: paymentDeclineFollowUp.invoiceNumber,
        payUrl: paymentDeclineFollowUp.payUrl,
        declineCode: paymentDeclineFollowUp.declineCode,
      })
    : null;

  const billingPanel = (
    <CustomerBillingPanel
      customerId={customer.id}
      billingMode={customer.billingMode}
      invoilessConfigured={invoilessConfigured}
      stripeConfigured={stripeConfigured}
      hasInvoilessId={Boolean(invoilessId)}
      billingSetup={billingSetup}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
        >
          ← Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Billing</p>
      </div>

      <CustomerSubnav customerId={customer.id} active="billing" />

      <CustomerBillingAlerts
        billingMode={customer.billingMode}
        setupBanner={setupQuery === "1"}
        setupWarning={setupWarning}
        stripeBanner={stripeBanner}
      />

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold text-emerald-950 dark:text-emerald-100">Subscription operations</h2><p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200">Service terms, renewals, pause controls, and collection operations are managed from subscriptions—not from this financial-history screen.</p></div>
          <div className="flex flex-wrap gap-2"><Link href={`/admin/customers/${customer.id}/subscriptions`} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-200">View subscriptions</Link><Link href={`/admin/subscriptions/${customer.id}/renewals`} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Manage renewals</Link></div>
        </div>
      </section>

      <PaymentRemindersSection
        customerId={customer.id}
        customerName={title}
        greetingName={customer.firstName?.trim() || customer.company?.trim() || title}
        billingMode={customer.billingMode}
        paymentReminders={customer.paymentReminders}
        customerEmail={customer.email}
        customerPhone={customer.phone}
        whatsAppConfigured={isTwilioWhatsAppConfigured()}
        candidates={outstandingReminderCandidates}
      />

      {paymentDeclineFollowUp ? (
        <CustomerPaymentDeclineFollowUpCard
          followUp={paymentDeclineFollowUp}
          customerId={customer.id}
          emailPreview={declineEmailPreview}
          whatsAppConfigured={isTwilioWhatsAppConfigured()}
        />
      ) : null}

      <BillingNotificationHistory customerId={customer.id} deliveries={notificationDeliveries} />

      {billingPanel}

      {customer.billingMode === "stripe_subscription" || stripeInvoices.length > 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Stripe invoices</h2>
          <details className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            <summary className="cursor-pointer font-medium text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              About mirrored invoices
            </summary>
            <p className="mt-2">
              Mirrored from Stripe webhooks (and <strong>Sync from Stripe</strong> if a webhook was
              missed). Amounts use Stripe’s billed total (not amount paid, so failed cards do not
              appear as EC$0). Only paid rows get a{" "}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">TL-INV-…</code> number and
              TL receipt PDF when Vercel Blob is configured. Paid receipts are emailed to the
              customer automatically when SMTP and Settings allow. Invoiless Paid mirror runs when
              the customer is linked there.
            </p>
          </details>
          <div className="mt-4">
            <StripeInvoicesList
              invoices={stripeInvoices}
              customerId={customer.id}
              customerEmail={customer.email}
            />
          </div>
        </section>
      ) : null}

      <p className="text-sm text-zinc-500">
        <Link
          href={`/admin/customers/${customer.id}/statements`}
          className="text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Generate statement
        </Link>
        {" · "}
        <Link
          href={`/admin/customers/${customer.id}/edit`}
          className="text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Edit profile &amp; address
        </Link>
        {" · "}
        <Link href={`/admin/customers/${customer.id}`} className="hover:underline">
          Customer overview
        </Link>
      </p>
    </div>
  );
}
