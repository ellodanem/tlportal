"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createCanonicalOnboardingAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";

type ServiceRow = { key: number; label: string; amount: string; classification: "standard" | "negotiated"; deviceId: string };

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950";

function addMonths(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || !Number.isInteger(months)) return value;
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

export function CanonicalCustomerOnboardingForm({
  customers,
  devices,
  today,
  defaultCustomerId,
}: {
  customers: { id: string; label: string; email: string | null }[];
  devices: { id: string; label: string; simLabel: string | null }[];
  today: string;
  defaultCustomerId?: string;
}) {
  const [state, action, pending] = useActionState(createCanonicalOnboardingAction, initialState);
  const router = useRouter();
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(defaultCustomerId ? "existing" : "new");
  const [services, setServices] = useState<ServiceRow[]>([{ key: 1, label: "", amount: "25.00", classification: "standard", deviceId: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [interval, setInterval] = useState("1");
  const [collection, setCollection] = useState("manual_invoice");
  const [commercialStart, setCommercialStart] = useState(today);
  const [billingAnchor, setBillingAnchor] = useState(today);
  const [nextBillingDate, setNextBillingDate] = useState(() => addMonths(today, 1));

  useEffect(() => { if (state.next) router.push(state.next); }, [router, state.next]);
  const total = services.reduce((sum, service) => sum + (Number(service.amount) || 0), 0);
  const selectedDeviceIds = new Set(services.map((service) => service.deviceId).filter(Boolean));

  function updateService(key: number, patch: Partial<ServiceRow>) {
    setServices((current) => current.map((service) => service.key === key ? { ...service, ...patch } : service));
  }

  function updateCommercialStart(value: string) {
    setCommercialStart(value);
    setNextBillingDate(addMonths(value, Number(interval)));
  }

  function updateInterval(value: string) {
    setInterval(value);
    setNextBillingDate(addMonths(commercialStart, Number(value)));
  }

  return (
    <form action={action} className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Step 1 · Customer</p><h2 className="text-lg font-semibold">Choose an existing customer or create a new one</h2><p className="text-sm text-zinc-500">A duplicate email is blocked so staff can attach another subscription to the existing customer instead.</p></div>
        <div className="mt-5 flex flex-wrap gap-3 text-sm"><label className="flex items-center gap-2"><input type="radio" name="customerMode" value="existing" checked={customerMode === "existing"} onChange={() => setCustomerMode("existing")} /> Existing customer</label><label className="flex items-center gap-2"><input type="radio" name="customerMode" value="new" checked={customerMode === "new"} onChange={() => setCustomerMode("new")} /> New customer</label></div>
        {customerMode === "existing" ? <label className="mt-4 block text-sm font-medium">Customer<select required name="customerId" defaultValue={defaultCustomerId ?? ""} className={inputClass}><option value="">Select a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}{customer.email ? ` · ${customer.email}` : ""}</option>)}</select></label> : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Company<input name="newCustomerCompany" className={inputClass} placeholder="Company or fleet name" /></label><label className="text-sm font-medium">First name<input name="newCustomerFirstName" className={inputClass} /></label><label className="text-sm font-medium">Last name<input name="newCustomerLastName" className={inputClass} /></label><label className="text-sm font-medium">Billing email<input name="newCustomerEmail" type="email" className={inputClass} /></label><label className="text-sm font-medium">Mobile / WhatsApp<input name="newCustomerPhone" type="tel" className={inputClass} placeholder="+1 758 555 1234" /></label><label className="text-sm font-medium">Country<input name="newCustomerCountry" className={inputClass} defaultValue="Saint Lucia" /></label><label className="text-sm font-medium sm:col-span-2">Billing address<input name="newCustomerAddress" className={inputClass} /></label><label className="text-sm font-medium">City<input name="newCustomerCity" className={inputClass} /></label><label className="text-sm font-medium sm:col-span-2">Invoice Cc<input name="newCustomerInvoiceCc" className={inputClass} placeholder="Optional comma-separated emails" /></label><label className="text-sm font-medium">Invoice Bcc<input name="newCustomerInvoiceBcc" className={inputClass} placeholder="Optional comma-separated emails" /></label><label className="text-sm font-medium sm:col-span-3">Internal onboarding note<textarea name="newCustomerNotes" rows={2} className={inputClass} /></label></div>}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Step 2 · Commercial subscription</p><h2 className="mt-1 text-lg font-semibold">Set the agreement and future billing schedule</h2><p className="mt-1 text-sm text-zinc-500">This saves a canonical draft. It does not create an invoice, recurring schedule, Stripe customer, charge, or customer notification.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Subscription name<input required name="name" className={inputClass} placeholder="Main fleet tracking" /></label><label className="text-sm font-medium">Reference<input name="reference" className={inputClass} placeholder="Optional PO / agreement" /></label><label className="text-sm font-medium">Collection method<select name="collectionMethod" value={collection} onChange={(event) => setCollection(event.target.value)} className={inputClass}><option value="manual_invoice">Manual / cheque invoice</option><option value="stripe_autocharge">Stripe-oriented (not connected yet)</option></select></label><label className="text-sm font-medium">Billing interval<select name="billingIntervalMonths" value={interval} onChange={(event) => updateInterval(event.target.value)} className={inputClass}><option value="1">Monthly</option><option value="3">Every 3 months</option><option value="6">Every 6 months</option><option value="12">Annual</option></select></label><label className="text-sm font-medium">Currency<input required name="currency" defaultValue="XCD" maxLength={3} className={inputClass} /></label><label className="text-sm font-medium">Manual grace days<input required name="gracePeriodDays" type="number" min="0" defaultValue="7" className={inputClass} /></label><label className="text-sm font-medium">Commercial start<input required type="date" name="commercialStartDate" value={commercialStart} onChange={(event) => updateCommercialStart(event.target.value)} className={inputClass} /></label><label className="text-sm font-medium">Billing anchor<input required type="date" name="billingAnchorDate" value={billingAnchor} onChange={(event) => setBillingAnchor(event.target.value)} className={inputClass} /></label><label className="text-sm font-medium">First renewal / next billing date<input required type="date" name="nextBillingDate" value={nextBillingDate} onChange={(event) => setNextBillingDate(event.target.value)} className={inputClass} /></label></div>
        <p className="mt-3 text-xs text-zinc-500">The first renewal defaults to one full interval after commercial start; staff can adjust it to the actual agreement. {collection === "stripe_autocharge" ? "Stripe-oriented subscriptions are saved locally only; no Stripe operation is initiated." : "Manual subscriptions use the configured grace period when they are later explicitly activated."}</p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Step 3 · Tracking services and equipment</p><h2 className="mt-1 text-lg font-semibold">One commercial service per vehicle or tracking arrangement</h2><p className="mt-1 text-sm text-zinc-500">Each service retains its own rate even when prices match. A selected device carries its existing SIM assignment; unavailable hardware is excluded.</p></div><button type="button" onClick={() => { setServices((current) => [...current, { key: nextKey, label: "", amount: "25.00", classification: "standard", deviceId: "" }]); setNextKey((value) => value + 1); }} className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">Add service</button></div>
        <div className="mt-5 space-y-4">{services.map((service, index) => <article key={service.key} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Service {index + 1}</h3>{services.length > 1 ? <button type="button" onClick={() => setServices((current) => current.filter((item) => item.key !== service.key))} className="text-sm font-semibold text-red-700 dark:text-red-300">Remove</button> : null}</div><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium lg:col-span-2">Service label<input required name="serviceLabel" value={service.label} onChange={(event) => updateService(service.key, { label: event.target.value })} className={inputClass} placeholder="Vehicle / asset tracking" /></label><label className="text-sm font-medium">Cycle price<input required name="serviceAmount" inputMode="decimal" value={service.amount} onChange={(event) => updateService(service.key, { amount: event.target.value })} className={inputClass} /></label><label className="text-sm font-medium">Price type<select name="serviceClassification" value={service.classification} onChange={(event) => updateService(service.key, { classification: event.target.value as ServiceRow["classification"] })} className={inputClass}><option value="standard">Standard</option><option value="negotiated">Negotiated</option></select></label><label className="text-sm font-medium sm:col-span-2 lg:col-span-4">Available device / SIM<select name="serviceDeviceId" value={service.deviceId} onChange={(event) => updateService(service.key, { deviceId: event.target.value })} className={inputClass}><option value="">Assign hardware later</option>{devices.map((device) => <option key={device.id} value={device.id} disabled={selectedDeviceIds.has(device.id) && service.deviceId !== device.id}>{device.label}{device.simLabel ? ` · ${device.simLabel}` : " · no SIM"}</option>)}</select></label></div></article>)}</div>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Review</p><div className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-zinc-500">Services</p><p className="font-semibold">{services.length}</p></div><div><p className="text-zinc-500">Cycle total</p><p className="font-semibold tabular-nums">EC${total.toFixed(2)}</p></div><div><p className="text-zinc-500">Billing state</p><p className="font-semibold">Draft · inactive</p></div></div><p className="mt-4 text-sm text-emerald-950 dark:text-emerald-100">Saving creates the customer if needed, a canonical draft subscription, service-level rates, and selected device/SIM service assignments atomically. It does not activate billing or create financial records.</p></section>
      {state.error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving onboarding..." : "Create canonical onboarding draft"}</button></div>
    </form>
  );
}
