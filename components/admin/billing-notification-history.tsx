"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { retryBillingNotificationAction, type RetryBillingNotificationState } from "@/app/admin/customers/billing-actions";

const initial: RetryBillingNotificationState = { error: null };

type Delivery = {
  id: string;
  eventKind: string;
  channel: "email" | "whatsapp";
  status: "pending" | "sending" | "sent" | "failed" | "suppressed";
  destination: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function BillingNotificationHistory({ customerId, deliveries }: { customerId: string; deliveries: Delivery[] }) {
  const router = useRouter();
  const [state, action] = useActionState(retryBillingNotificationAction, initial);
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  return <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Billing notification history</h2>
    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Automatic email and WhatsApp invoice notices. Failed messages can be retried after the invoice is rechecked.</p>
    {deliveries.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No automatic billing notifications yet.</p> : <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
      {deliveries.map((delivery) => <li key={delivery.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium capitalize text-zinc-800 dark:text-zinc-100">{delivery.eventKind.replaceAll("_", " ")} · {delivery.channel}</p>
          <p className="text-xs text-zinc-500">
            <span className="capitalize">{delivery.status}</span> {delivery.sentAt ? `on ${formatDate(delivery.sentAt)}` : `since ${formatDate(delivery.createdAt)}`} · {delivery.destination ?? "No destination"} · {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}
          </p>
          {delivery.lastError ? <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{delivery.lastError}</p> : null}
        </div>
        {delivery.status === "failed" ? <form action={action}>
          <input type="hidden" name="deliveryId" value={delivery.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <button className="min-h-10 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800">Retry {delivery.channel}</button>
        </form> : null}
      </li>)}
    </ul>}
    {state.error ? <p className="mt-3 text-sm text-rose-700" role="alert">{state.error}</p> : null}
    {state.ok ? <p className="mt-3 text-sm text-emerald-700" role="status">{state.message}</p> : null}
  </section>;
}
