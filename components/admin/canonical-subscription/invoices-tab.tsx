import Link from "next/link";

import { cardClass } from "@/components/admin/canonical-subscription/format";
import { FinancialLedgerTable, FinancialPaymentsList } from "@/components/admin/financial-ledger-table";
import type { SubscriptionDetail } from "@/lib/admin/canonical-subscription-page-data";
import { NOT_LINKED_LABEL } from "@/lib/domain/financial-ledger";
import { formatMoney } from "@/lib/domain/native-billing";
import { getSubscriptionFinancials } from "@/lib/services/financial-ledger-service";

/**
 * Subscription-scoped view of invoices and payments with links into Billing. It is a link hub,
 * not a second invoice editor: create, send, void and record payment all happen in Billing.
 */
export async function SubscriptionInvoicesTab({ subscription }: { subscription: SubscriptionDetail }) {
  const ledger = await getSubscriptionFinancials(subscription.id, subscription.customerId);
  const currency = subscription.currency ?? "XCD";
  const outstanding = ledger.outstanding;
  const hasUnlinked = ledger.unlinked.count > 0;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="invoices-heading" className={cardClass}>
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-5 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800">
          <div>
            <h2 id="invoices-heading" className="text-lg font-semibold">Invoices linked to this subscription</h2>
            <p className="mt-1 text-sm text-zinc-500">Native and provider invoices appear once each, with their source. Outstanding for this subscription: <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{outstanding ? formatMoney(outstanding.amount, outstanding.currency) : ledger.totalsByCurrency.length > 1 ? "Multiple currencies" : formatMoney(0, currency)}</span>.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/subscriptions/customers/${subscription.customerId}/billing`} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Customer billing</Link>
            <Link href={`/admin/billing?q=${subscription.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Open in Billing</Link>
            <Link href={`/admin/tl-invoices/new?customerId=${subscription.customerId}`} className="inline-flex min-h-11 items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">Create invoice</Link>
          </div>
        </div>
        <FinancialLedgerTable ledger={ledger} customerId={subscription.customerId} emptyMessage="No invoices are linked to this subscription yet. This does not mean the customer has no invoices; see the note below for invoices that are not linked." />
      </section>

      {hasUnlinked ? (
        <section role="note" className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="font-semibold">{ledger.unlinked.count} customer invoice{ledger.unlinked.count === 1 ? "" : "s"}: {NOT_LINKED_LABEL}</h2>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">These belong to {subscription.customerLabel} but are not attached to any subscription, so they are not counted above{ledger.unlinked.outstandingByCurrency.some((entry) => entry.amount > 0) ? ` (open balance ${ledger.unlinked.outstandingByCurrency.filter((entry) => entry.amount > 0).map((entry) => formatMoney(entry.amount, entry.currency)).join(", ")})` : ""}. Typical examples are installation, hardware or one-off charges.</p>
          <p className="mt-2"><Link href={`/admin/subscriptions/customers/${subscription.customerId}/billing`} className="font-semibold text-emerald-700 underline dark:text-emerald-400">View the full customer ledger</Link></p>
        </section>
      ) : null}

      <section aria-labelledby="payments-heading" className={cardClass}>
        <div className="border-b border-zinc-200 p-5 dark:border-zinc-800"><h2 id="payments-heading" className="text-lg font-semibold">Payments</h2><p className="mt-1 text-sm text-zinc-500">Recorded payments on this subscription&apos;s invoices. Record or void a payment on the invoice in Billing.</p></div>
        <FinancialPaymentsList ledger={ledger} />
      </section>
    </div>
  );
}
