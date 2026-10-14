"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createSubscriptionAction, type CreateSubscriptionState } from "@/app/admin/subscriptions/actions";

const initial: CreateSubscriptionState = {};

export function SubscriptionComposer({
  customers,
  defaultRate,
}: {
  customers: { id: string; name: string; email: string | null }[];
  defaultRate: number;
}) {
  const [state, action, pending] = useActionState(createSubscriptionAction, initial);
  return (
    <form action={action} className="flex flex-col gap-6">
      <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800"><h2 className="font-semibold">Subscription details</h2><p className="mt-1 text-sm text-zinc-500">Set the commercial terms once. The collection method controls whether TL Portal uses card autocharge or native invoices.</p></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2 lg:col-span-1"><span className="font-medium">Customer</span><select name="customerId" required className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950"><option value="">Choose a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.email ? ` · ${customer.email}` : ""}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Term</span><select name="durationMonths" defaultValue="1" className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950"><option value="1">Monthly</option><option value="3">Every 3 months</option><option value="6">Every 6 months</option><option value="12">Annual</option></select></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Vehicles</span><input name="vehicleCount" type="number" min="1" defaultValue="1" className="rounded-lg border border-zinc-300 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950" /></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Monthly rate per vehicle (XCD)</span><input name="monthlyRateXcd" defaultValue="default" placeholder={`${defaultRate} default`} className="rounded-lg border border-zinc-300 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950" /><span className="text-xs text-zinc-500">Use “default” or enter a custom amount.</span></label>
          <fieldset className="flex flex-col gap-2 text-sm sm:col-span-2"><legend className="font-medium">Collection method</legend><label className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/20"><input type="radio" name="collectionMethod" value="card" defaultChecked className="mt-0.5" /><span><strong className="block">Card autocharge</strong><span className="text-xs text-zinc-600 dark:text-zinc-400">Create a Stripe Checkout link. The subscription activates after payment.</span></span></label><label className="flex items-start gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"><input type="radio" name="collectionMethod" value="manual" className="mt-0.5" /><span><strong className="block">Manual invoice</strong><span className="text-xs text-zinc-600 dark:text-zinc-400">Generate recurring native invoices for cash, cheque, bank transfer, or other payment methods.</span></span></label></fieldset>
        </div>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"><h2 className="font-semibold">Manual invoice settings</h2><p className="mt-1 text-sm text-zinc-500">These settings apply when manual invoice is selected.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">Days until due</span><input name="dueDays" type="number" min="0" defaultValue="30" className="rounded-lg border border-zinc-300 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950" /></label><label className="flex items-center gap-2 self-end pb-2 text-sm"><input name="autoEmail" type="checkbox" defaultChecked /> Email each invoice automatically</label><label className="flex flex-col gap-1.5 text-sm sm:col-span-2"><span className="font-medium">Payment instructions</span><textarea name="paymentInstructions" rows={3} placeholder="How should this customer pay?" className="rounded-lg border border-zinc-300 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950" /></label></div></section>
      {state.error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</p> : null}
      {state.ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><p>{state.message}</p>{state.url ? <Link href={state.url} className="mt-2 inline-block font-semibold underline">{state.url.startsWith("http") ? "Open checkout link" : "Open subscription"}</Link> : null}</div> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Link href="/admin/subscriptions" className="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-semibold dark:border-zinc-700">Cancel</Link><button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{pending ? "Creating…" : "Create subscription"}</button></div>
    </form>
  );
}
