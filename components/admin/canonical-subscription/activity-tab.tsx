import Link from "next/link";

import { cardClass, cycleUnit, displayDate, displayDateTime, money } from "@/components/admin/canonical-subscription/format";
import type { SubscriptionDetail } from "@/lib/admin/canonical-subscription-page-data";
import { subscriptionServicePath } from "@/lib/domain/canonical-subscription-navigation";
import { listOperationalEventsForSubscription } from "@/lib/services/operational-event-service";

/** Subscription-scoped history. Customer-wide activity stays on the customer's Activity page. */
export async function SubscriptionActivityTab({ subscription }: { subscription: SubscriptionDetail }) {
  const events = await listOperationalEventsForSubscription(subscription.id, subscription.customerId);
  const activation = subscription.operationalActivation;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="events-heading" className={cardClass}>
        <div className="border-b border-zinc-200 p-5 dark:border-zinc-800"><h2 id="events-heading" className="text-lg font-semibold">Subscription events</h2><p className="mt-1 text-sm text-zinc-500">Staff changes to this subscription: lifecycle, services, prices and hardware. Customer-wide activity is on the customer&apos;s Activity page.</p></div>
        {events.length ? (
          <ol className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col justify-between gap-1 px-5 py-3 sm:flex-row">
                <span>{event.summary}<span className="ml-2 text-xs text-zinc-500">{event.category.replace("subscription.", "").replaceAll("_", " ")}</span></span>
                <time dateTime={event.occurredAt.toISOString()} className="text-xs text-zinc-500">{displayDateTime(event.occurredAt)}</time>
              </li>
            ))}
          </ol>
        ) : <p className="p-6 text-sm text-zinc-500">No staff events have been recorded for this subscription yet.</p>}
      </section>

      {activation ? (
        <section aria-labelledby="activation-heading" className={`${cardClass} p-5`}>
          <h2 id="activation-heading" className="text-lg font-semibold">Activation record</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-zinc-500">First billing</dt><dd className="mt-1 font-medium">{activation.initialBillingMode === "advance_invoice" ? "Initial invoice issued" : "Explicitly deferred"}</dd></div>
            <div><dt className="text-zinc-500">First coverage</dt><dd className="mt-1 font-medium">{displayDate(activation.initialPeriodStart)} to {displayDate(activation.initialPeriodEnd)}</dd></div>
            <div><dt className="text-zinc-500">Approved by</dt><dd className="mt-1 font-medium">{activation.approvedBy.name || activation.approvedBy.email}</dd></div>
            <div><dt className="text-zinc-500">Activated</dt><dd className="mt-1 font-medium">{displayDate(activation.performedAt)}</dd></div>
          </dl>
          {activation.initialInvoice ? <p className="mt-3 text-sm">Initial invoice: <Link href={`/admin/tl-invoices/${activation.initialInvoice.id}`} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">{activation.initialInvoice.number ?? "Draft"}</Link></p> : null}
        </section>
      ) : null}

      <section aria-labelledby="history-heading" className={`${cardClass} p-5`}>
        <h2 id="history-heading" className="text-lg font-semibold">Price and hardware history</h2>
        {subscription.items.length ? (
          <div className="mt-4 space-y-3">
            {subscription.items.map((item) => (
              <article key={item.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                <h3 className="font-semibold"><Link href={subscriptionServicePath(subscription.id, item.id)} className="text-emerald-700 hover:underline dark:text-emerald-400">{item.label || "Tracking service"}</Link></h3>
                <div className="mt-3 grid gap-5 lg:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Price history</h4>
                    {item.rates.length ? <ul className="mt-2 space-y-2 text-sm">{item.rates.map((rate) => <li key={rate.id} className="flex flex-col justify-between gap-1 rounded-lg bg-zinc-50 px-3 py-2 sm:flex-row dark:bg-zinc-950"><span className="font-medium tabular-nums">{money(rate.agreedAmountPerCycle.toString(), rate.currency)} / {cycleUnit(rate.billingIntervalMonths)} · <span className="capitalize">{rate.classification}</span></span><span className="text-zinc-500">{displayDate(rate.effectiveFrom)} to {displayDate(rate.effectiveUntil, "open")}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No price history.</p>}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hardware assignments</h4>
                    {item.serviceAssignments.length ? <ul className="mt-2 space-y-2 text-sm">{item.serviceAssignments.map((assignment) => <li key={assignment.id} className="flex flex-col justify-between gap-1 sm:flex-row"><span>{assignment.device.label?.trim() || assignment.device.deviceModel.name} · <span className="capitalize text-zinc-500">{assignment.status.replaceAll("_", " ")}</span></span><span className="text-zinc-500">{displayDate(assignment.startDate)} to {displayDate(assignment.endDate, "present")}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-500">No linked device history.</p>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-zinc-500">No services yet.</p>}
      </section>
    </div>
  );
}
