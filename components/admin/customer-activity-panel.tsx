import { CustomerActivityEvent, CustomerActivityEventTime } from "@/components/admin/customer-activity-event";
import { CustomerNoteForm } from "@/components/admin/customer-note-form";
import { listOperationalEventsForCustomer } from "@/lib/services/operational-event-service";

/**
 * Internal note form and the activity timeline for one customer. Shared by the Subscriptions
 * customer workspace and the original Customers tab.
 */
export async function CustomerActivityPanel({ customerId }: { customerId: string }) {
  const events = await listOperationalEventsForCustomer(customerId, 100);

  return (
    <>
      <CustomerNoteForm customerId={customerId} />
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Activity timeline</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Billing, communication, operational, and internal customer events.</p>
        </div>
        {events.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">No activity recorded yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {events.map((event) => (
              <div key={event.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <CustomerActivityEvent event={event} />
                <CustomerActivityEventTime occurredAt={event.occurredAt} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
