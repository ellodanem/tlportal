"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createCanonicalDraftAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950";

export function CanonicalSubscriptionCreateForm({
  customers,
  today,
}: {
  customers: { id: string; label: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState(createCanonicalDraftAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.next) router.push(state.next);
  }, [router, state.next]);

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h2 className="font-semibold">Commercial agreement</h2>
          <p className="mt-1 text-sm text-zinc-500">This creates an unmigrated shadow draft only.</p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Customer
            <select name="customerId" required className={inputClass} defaultValue="">
              <option value="" disabled>Select a customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Subscription name
            <input name="name" required className={inputClass} placeholder="Fleet tracking agreement" />
          </label>
          <label className="text-sm font-medium">Reference <span className="font-normal text-zinc-500">(optional)</span>
            <input name="reference" className={inputClass} placeholder="Contract or internal reference" />
          </label>
          <label className="text-sm font-medium">Collection preference
            <select name="collectionMethod" required className={inputClass} defaultValue="manual_invoice">
              <option value="manual_invoice">Manual invoice</option>
              <option value="stripe_autocharge">Stripe autocharge preference</option>
            </select>
          </label>
          <label className="text-sm font-medium">Billing frequency
            <select name="billingIntervalMonths" required className={inputClass} defaultValue="1">
              <option value="1">Monthly</option>
              <option value="3">Quarterly</option>
              <option value="6">Every 6 months</option>
              <option value="12">Annual</option>
            </select>
          </label>
          <label className="text-sm font-medium">Default price per service / cycle (EC$)
            <input name="defaultAgreedAmountPerCycle" required inputMode="decimal" className={inputClass} placeholder="25.00" />
          </label>
          <label className="text-sm font-medium">Commercial start
            <input type="date" name="commercialStartDate" required defaultValue={today} className={inputClass} />
          </label>
          <label className="text-sm font-medium">Billing anchor
            <input type="date" name="billingAnchorDate" required defaultValue={today} className={inputClass} />
          </label>
          <label className="text-sm font-medium">Next billing date
            <input type="date" name="nextBillingDate" required defaultValue={today} className={inputClass} />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Optional first billable service</h2>
        <p className="mt-1 text-sm text-zinc-500">Leave the label blank to create the agreement without an item.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Service label
            <input name="initialItemLabel" className={inputClass} placeholder="Vehicle A tracking" />
          </label>
          <label className="text-sm font-medium">Negotiated cycle price <span className="font-normal text-zinc-500">(optional)</span>
            <input name="initialItemAmount" inputMode="decimal" className={inputClass} placeholder="Uses default when blank" />
          </label>
          <label className="text-sm font-medium">Service activation date <span className="font-normal text-zinc-500">(optional)</span>
            <input type="date" name="initialActivationDate" className={inputClass} />
          </label>
        </div>
      </section>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        Saving does not activate billing, create an invoice or schedule, contact Stripe, or change the customer&apos;s legacy billing mode.
      </div>
      {state.error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="submit" disabled={pending || customers.length === 0} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Creating draft…" : "Create shadow draft"}
        </button>
      </div>
    </form>
  );
}
