"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createCanonicalOnboardingAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";
import {
  addMonthsClamped,
  cadenceLabel,
  computeProration,
  cycleUnitLabel,
  formatCents,
  parseMoneyToCents,
  type SubscriptionProrationMethod,
} from "@/lib/domain/subscription-proration";

type AdjustmentChoice = "none" | SubscriptionProrationMethod;
type ServiceRow = {
  key: number;
  label: string;
  labelTouched: boolean;
  amount: string;
  classification: "standard" | "negotiated";
  deviceId: string;
  adjustment: AdjustmentChoice;
  adjustmentAmount: string;
  adjustmentReason: string;
};
export type OnboardingPlan = { durationMonths: number; priceXcd: string };
export type OnboardingExistingSubscription = {
  id: string;
  name: string | null;
  billingIntervalMonths: number | null;
  nextBillingDate: string | null;
  serviceCount: number;
};

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950";
const cardClass = "rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900";
const steps = ["Customer", "Plan", "Customize", "Hardware", "Billing", "Review"] as const;
const FALLBACK_CADENCES = [1, 3, 6, 12];

function displayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

function emptyService(key: number, amount: string): ServiceRow {
  return { key, label: "", labelTouched: false, amount, classification: "standard", deviceId: "", adjustment: "daily_proration", adjustmentAmount: "", adjustmentReason: "" };
}

export function CanonicalCustomerOnboardingForm({
  customers,
  devices,
  today,
  defaultCustomerId,
  plans,
  existingSubscriptions,
  creationKey,
}: {
  customers: { id: string; label: string; email: string | null }[];
  devices: { id: string; label: string; simLabel: string | null }[];
  today: string;
  defaultCustomerId?: string;
  plans: OnboardingPlan[];
  existingSubscriptions: Record<string, OnboardingExistingSubscription[]>;
  creationKey: string;
}) {
  const [state, action, pending] = useActionState(createCanonicalOnboardingAction, initialState);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(defaultCustomerId ? "existing" : "new");
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [newCompany, setNewCompany] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");

  const cadenceOptions = plans.length ? plans.map((plan) => plan.durationMonths) : FALLBACK_CADENCES;
  const [interval, setIntervalMonths] = useState(cadenceOptions.includes(12) ? 12 : cadenceOptions[0] ?? 12);
  const planPrice = (months: number) => plans.find((plan) => plan.durationMonths === months)?.priceXcd ?? "";
  const [subscriptionName, setSubscriptionName] = useState("");
  const [reference, setReference] = useState("");
  const [services, setServices] = useState<ServiceRow[]>([emptyService(1, planPrice(interval))]);
  const [nextKey, setNextKey] = useState(2);

  const [startDate, setStartDate] = useState(today);
  const [alignment, setAlignment] = useState<"new_cycle" | "align_to_renewal">("new_cycle");
  const [alignedRenewal, setAlignedRenewal] = useState("");
  const [collection, setCollection] = useState("manual_invoice");
  const [graceDays, setGraceDays] = useState("7");

  useEffect(() => { if (state.next) router.push(state.next); }, [router, state.next]);

  const chosenCustomer = customers.find((customer) => customer.id === customerId);
  const customerName = customerMode === "existing"
    ? chosenCustomer?.label ?? ""
    : newCompany.trim() || [newFirst, newLast].map((part) => part.trim()).filter(Boolean).join(" ");
  const siblings = useMemo(
    () => (customerMode === "existing" && customerId ? existingSubscriptions[customerId] ?? [] : []),
    [customerMode, customerId, existingSubscriptions],
  );
  const alignableRenewals = useMemo(() => {
    const seen = new Set<string>();
    return siblings.filter((sibling) => sibling.billingIntervalMonths === interval && sibling.nextBillingDate && !seen.has(sibling.nextBillingDate) && seen.add(sibling.nextBillingDate));
  }, [siblings, interval]);

  const effectiveName = subscriptionName.trim() || `${cadenceLabel(interval)} GPS tracking`;
  const nextBillingDate = alignment === "align_to_renewal" && alignedRenewal ? alignedRenewal : addMonthsClamped(startDate, interval);
  const unit = cycleUnitLabel(interval);
  const selectedDeviceIds = new Set(services.map((service) => service.deviceId).filter(Boolean));

  const computed = services.map((service) => {
    let cents: number | null = null;
    try { cents = parseMoneyToCents(service.amount || "0"); } catch { cents = null; }
    let proration: ReturnType<typeof computeProration> | null = null;
    let prorationError: string | null = null;
    if (alignment === "align_to_renewal" && service.adjustment !== "none" && cents != null && cents > 0 && alignedRenewal) {
      try {
        proration = computeProration({
          startDate,
          renewalDate: alignedRenewal,
          billingIntervalMonths: interval,
          cycleAmount: formatCents(cents),
          currency: "XCD",
          method: service.adjustment,
          manualAmount: service.adjustment === "manual_amount" ? service.adjustmentAmount : null,
          reason: service.adjustmentReason,
        });
      } catch (error) {
        prorationError = error instanceof Error ? error.message : "Check the partial-period amount.";
      }
    }
    return { cents, proration, prorationError };
  });
  const cycleTotalCents = computed.reduce((sum, entry) => sum + (entry.cents ?? 0), 0);

  function updateService(key: number, patch: Partial<ServiceRow>) {
    setServices((current) => current.map((service) => service.key === key ? { ...service, ...patch } : service));
  }

  function selectServiceDevice(service: ServiceRow, deviceId: string) {
    const device = devices.find((candidate) => candidate.id === deviceId);
    updateService(service.key, {
      deviceId,
      label: device && (!service.label.trim() || !service.labelTouched) ? device.label : service.label,
    });
  }

  function chooseInterval(months: number) {
    setIntervalMonths(months);
    setAlignedRenewal("");
    setAlignment("new_cycle");
    // Re-seed prices only for services the operator has not priced yet.
    setServices((current) => current.map((service) => service.amount.trim() && service.amount !== planPrice(interval) ? service : { ...service, amount: planPrice(months) }));
  }

  function validate(index: number): string | null {
    if (index === 0) {
      if (customerMode === "existing" && !customerId) return "Select a customer, or choose “New customer”.";
      if (customerMode === "new" && !customerName) return "Enter a company name, or a first and last name.";
    }
    if (index === 2) {
      if (!startDate) return "Choose the service start date.";
      if (services.some((service) => !service.label.trim())) return "Every service needs a vehicle or asset name.";
      if (computed.some((entry) => entry.cents == null || entry.cents <= 0)) return `Every service needs an agreed price per ${unit}.`;
      if (alignment === "align_to_renewal") {
        if (!alignedRenewal) return "Choose the renewal date to align with.";
        const first = computed.find((entry) => entry.prorationError);
        if (first?.prorationError) return first.prorationError;
      }
    }
    if (index === 3) {
      const ids = services.map((service) => service.deviceId).filter(Boolean);
      if (new Set(ids).size !== ids.length) return "A device can only be assigned to one service.";
    }
    return null;
  }

  function goNext() {
    const problem = validate(step);
    setStepError(problem);
    if (!problem) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function goTo(target: number) {
    if (target > step) {
      for (let index = step; index < target; index += 1) {
        const problem = validate(index);
        if (problem) { setStepError(problem); setStep(index); return; }
      }
    }
    setStepError(null);
    setStep(target);
  }

  return (
    <form action={action} className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <input type="hidden" name="creationKey" value={creationKey} />
      <input type="hidden" name="customerMode" value={customerMode} />
      <input type="hidden" name="billingIntervalMonths" value={interval} />
      <input type="hidden" name="currency" value="XCD" />
      <input type="hidden" name="renewalAlignment" value={alignment} />
      <input type="hidden" name="commercialStartDate" value={startDate} />
      <input type="hidden" name="billingAnchorDate" value={startDate} />
      <input type="hidden" name="nextBillingDate" value={nextBillingDate} />
      <input type="hidden" name="name" value={effectiveName} />

      <ol className="grid grid-cols-3 gap-2 text-xs font-semibold sm:grid-cols-6" aria-label="Progress">
        {steps.map((name, index) => (
          <li key={name}>
            <button type="button" onClick={() => goTo(index)} aria-current={index === step ? "step" : undefined} className={`min-h-11 w-full rounded-lg px-2 py-2 ${index === step ? "bg-emerald-700 text-white" : index < step ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>{index + 1}. {name}</button>
          </li>
        ))}
      </ol>

      <section hidden={step !== 0} className={cardClass}>
        <h2 className="text-lg font-semibold">Who is this subscription for?</h2>
        <p className="mt-1 text-sm text-zinc-500">Choose an existing customer to add another subscription to them, or create a new one. A duplicate email is blocked.</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={customerMode === "existing"} onChange={() => setCustomerMode("existing")} /> Existing customer</label>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={customerMode === "new"} onChange={() => setCustomerMode("new")} /> New customer</label>
        </div>
        <div hidden={customerMode !== "existing"}>
          <label className="mt-2 block text-sm font-medium">Customer
            <select name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} disabled={customerMode !== "existing"} className={inputClass}>
              <option value="">Select a customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}{customer.email ? ` · ${customer.email}` : ""}</option>)}
            </select>
          </label>
          {siblings.length ? (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
              <p className="font-semibold">This customer already has {siblings.length} subscription{siblings.length === 1 ? "" : "s"}</p>
              <ul className="mt-1 list-disc pl-5">{siblings.map((sibling) => <li key={sibling.id}>{cadenceLabel(sibling.billingIntervalMonths)} · {sibling.serviceCount} service{sibling.serviceCount === 1 ? "" : "s"}{sibling.nextBillingDate ? ` · renews ${displayDate(sibling.nextBillingDate)}` : ""}</li>)}</ul>
              <p className="mt-2 text-xs">To add a vehicle to one of them, open it and use <strong>Add service</strong>. Continue here only for a genuinely separate agreement — it will not be merged automatically.</p>
            </div>
          ) : null}
        </div>
        <div hidden={customerMode !== "new"} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Company<input name="newCustomerCompany" value={newCompany} onChange={(event) => setNewCompany(event.target.value)} className={inputClass} placeholder="Company or fleet name" /></label>
          <label className="text-sm font-medium">First name<input name="newCustomerFirstName" value={newFirst} onChange={(event) => setNewFirst(event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-medium">Last name<input name="newCustomerLastName" value={newLast} onChange={(event) => setNewLast(event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-medium">Billing email<input name="newCustomerEmail" type="email" className={inputClass} /></label>
          <label className="text-sm font-medium">Mobile / WhatsApp<input name="newCustomerPhone" type="tel" className={inputClass} placeholder="+1 758 555 1234" /></label>
          <details className="sm:col-span-2">
            <summary className="cursor-pointer text-sm font-semibold text-emerald-700 dark:text-emerald-400">More customer details (optional)</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Country<input name="newCustomerCountry" className={inputClass} defaultValue="Saint Lucia" /></label>
              <label className="text-sm font-medium">City<input name="newCustomerCity" className={inputClass} /></label>
              <label className="text-sm font-medium sm:col-span-2">Billing address<input name="newCustomerAddress" className={inputClass} /></label>
              <label className="text-sm font-medium">Invoice Cc<input name="newCustomerInvoiceCc" className={inputClass} placeholder="Comma-separated emails" /></label>
              <label className="text-sm font-medium">Invoice Bcc<input name="newCustomerInvoiceBcc" className={inputClass} placeholder="Comma-separated emails" /></label>
              <label className="text-sm font-medium sm:col-span-2">Internal note<textarea name="newCustomerNotes" rows={2} className={inputClass} /></label>
            </div>
          </details>
        </div>
      </section>

      <section hidden={step !== 1} className={cardClass}>
        <h2 className="text-lg font-semibold">Choose a plan</h2>
        <p className="mt-1 text-sm text-zinc-500">The plan sets the billing cycle and a starting price. You can change the price per service on the next step.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {cadenceOptions.map((months) => (
            <label key={months} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-4 ${interval === months ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
              <input type="radio" checked={interval === months} onChange={() => chooseInterval(months)} className="mt-1" />
              <span><span className="block font-semibold">{cadenceLabel(months)}</span><span className="block text-sm text-zinc-500">{planPrice(months) ? `EC$${planPrice(months)} per ${cycleUnitLabel(months)} per service (standard)` : "Set the price on the next step"}</span></span>
            </label>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Subscription name (optional)<input value={subscriptionName} onChange={(event) => setSubscriptionName(event.target.value)} className={inputClass} placeholder={`${cadenceLabel(interval)} GPS tracking`} /></label>
          <label className="text-sm font-medium">Reference (optional)<input name="reference" value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} placeholder="PO / agreement number" /></label>
        </div>
      </section>

      <section hidden={step !== 2} className={cardClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-lg font-semibold">Customize services</h2><p className="mt-1 text-sm text-zinc-500">One service per vehicle or tracked asset, each with its own agreed price per {unit}.</p></div>
          <button type="button" onClick={() => { setServices((current) => [...current, emptyService(nextKey, current.at(-1)?.amount || planPrice(interval))]); setNextKey((value) => value + 1); }} className="min-h-11 rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">Add another service</button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Service start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass} /></label>
          <div className="text-sm font-medium">Renewal
            <select value={alignment === "align_to_renewal" ? alignedRenewal || "custom" : "new_cycle"} onChange={(event) => {
              const value = event.target.value;
              if (value === "new_cycle") { setAlignment("new_cycle"); setAlignedRenewal(""); }
              else { setAlignment("align_to_renewal"); setAlignedRenewal(value === "custom" ? "" : value); }
            }} className={inputClass}>
              <option value="new_cycle">Start a new {cadenceLabel(interval).toLowerCase()} cycle on the start date</option>
              {alignableRenewals.map((sibling) => <option key={sibling.id} value={sibling.nextBillingDate ?? ""}>Align with existing renewal · {displayDate(sibling.nextBillingDate ?? "")}</option>)}
              <option value="custom">Align to another renewal date…</option>
            </select>
            {alignment === "align_to_renewal" && !alignableRenewals.some((sibling) => sibling.nextBillingDate === alignedRenewal) ? (
              <input type="date" value={alignedRenewal} onChange={(event) => setAlignedRenewal(event.target.value)} className={inputClass} aria-label="Renewal date to align with" />
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500">{alignment === "align_to_renewal" ? "Services start on the date above and join full recurring billing on the renewal date. The time in between is an agreed partial-period charge, recorded but not invoiced." : `First renewal: ${displayDate(nextBillingDate)}. Matching renewal dates do not merge this with another subscription.`}</p>

        <div className="mt-5 space-y-4">
          {services.map((service, index) => (
            <article key={service.key} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Service {index + 1}</h3>
                {services.length > 1 ? <button type="button" onClick={() => setServices((current) => current.filter((item) => item.key !== service.key))} className="min-h-11 px-2 text-sm font-semibold text-red-700 dark:text-red-300">Remove</button> : null}
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium sm:col-span-2">Vehicle / asset name<input name="serviceLabel" value={service.label} onChange={(event) => updateService(service.key, { label: event.target.value, labelTouched: true })} className={inputClass} placeholder="Toyota Hilux – SLG 4821" /></label>
                <label className="text-sm font-medium">Price per {unit} (EC$)<input name="serviceAmount" inputMode="decimal" value={service.amount} onChange={(event) => updateService(service.key, { amount: event.target.value })} className={inputClass} /></label>
                <label className="text-sm font-medium">Price type
                  <select name="serviceClassification" value={service.classification} onChange={(event) => updateService(service.key, { classification: event.target.value as ServiceRow["classification"] })} className={inputClass}>
                    <option value="standard">Standard</option>
                    <option value="negotiated">Negotiated</option>
                  </select>
                </label>
              </div>
              <div hidden={alignment !== "align_to_renewal"} className="mt-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
                <label className="text-sm font-medium">Partial-period charge until the renewal
                  <select name="serviceAdjustmentMethod" value={service.adjustment} onChange={(event) => updateService(service.key, { adjustment: event.target.value as AdjustmentChoice })} className={inputClass}>
                    <option value="daily_proration">Prorate by days</option>
                    <option value="monthly_rounded">Round to whole months</option>
                    <option value="manual_amount">Agreed amount</option>
                    <option value="none">No partial-period charge</option>
                  </select>
                </label>
                <div hidden={service.adjustment !== "manual_amount"}><label className="mt-3 block text-sm font-medium">Agreed amount (EC$)<input name="serviceAdjustmentAmount" inputMode="decimal" value={service.adjustmentAmount} onChange={(event) => updateService(service.key, { adjustmentAmount: event.target.value })} className={inputClass} /></label></div>
                <div hidden={service.adjustment !== "manual_amount" && service.adjustment !== "monthly_rounded"}><label className="mt-3 block text-sm font-medium">Reason<input name="serviceAdjustmentReason" value={service.adjustmentReason} onChange={(event) => updateService(service.key, { adjustmentReason: event.target.value })} className={inputClass} placeholder="e.g. Agreed with customer" /></label></div>
                {service.adjustment !== "none" ? (
                  <p aria-live="polite" className="mt-3 text-sm">{computed[index].proration ? <><span className="font-semibold tabular-nums">EC${computed[index].proration!.amount}</span> <span className="text-xs text-zinc-500">· {computed[index].proration!.explanation}{computed[index].proration!.method !== "daily_proration" ? ` Daily formula: EC$${computed[index].proration!.dailyAmount}.` : ""}</span></> : <span className="text-xs text-zinc-500">{computed[index].prorationError ?? "Choose the renewal date and a price to preview the amount."}</span>}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section hidden={step !== 3} className={cardClass}>
        <h2 className="text-lg font-semibold">Assign hardware</h2>
        <p className="mt-1 text-sm text-zinc-500">Optional. A selected device brings its SIM; unavailable hardware is excluded. You can assign hardware later.</p>
        <div className="mt-4 space-y-4">
          {services.map((service, index) => (
            <label key={service.key} className="block text-sm font-medium">{service.label.trim() || `Service ${index + 1}`}
              <select name="serviceDeviceId" value={service.deviceId} onChange={(event) => selectServiceDevice(service, event.target.value)} className={inputClass}>
                <option value="">Assign hardware later</option>
                {devices.map((device) => <option key={device.id} value={device.id} disabled={selectedDeviceIds.has(device.id) && service.deviceId !== device.id}>{device.label}{device.simLabel ? ` · ${device.simLabel}` : " · no SIM"}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section hidden={step !== 4} className={cardClass}>
        <h2 className="text-lg font-semibold">Billing method</h2>
        <div className="mt-4 grid gap-3">
          <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-4 ${collection === "manual_invoice" ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
            <input type="radio" name="collectionMethod" value="manual_invoice" checked={collection === "manual_invoice"} onChange={() => setCollection("manual_invoice")} className="mt-1" />
            <span><span className="block font-semibold">Manual / cheque invoice</span><span className="block text-sm text-zinc-500">Invoices are issued by TL Portal and paid by transfer, cheque or cash.</span></span>
          </label>
          <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-4 ${collection === "stripe_autocharge" ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
            <input type="radio" name="collectionMethod" value="stripe_autocharge" checked={collection === "stripe_autocharge"} onChange={() => setCollection("stripe_autocharge")} className="mt-1" />
            <span><span className="block font-semibold">Card billing (Stripe)</span><span className="block text-sm text-zinc-500">Saved locally only. No Stripe customer, charge or subscription is created from this screen.</span></span>
          </label>
        </div>
        <label className="mt-4 block max-w-xs text-sm font-medium">Grace days before an unpaid invoice needs attention<input name="gracePeriodDays" type="number" min="0" value={graceDays} onChange={(event) => setGraceDays(event.target.value)} className={inputClass} /></label>
      </section>

      <section hidden={step !== 5} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <h2 className="text-lg font-semibold">Review</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-zinc-500">Customer</dt><dd className="font-semibold">{customerName || "—"}{customerMode === "new" ? " (new)" : ""}</dd></div>
          <div><dt className="text-zinc-500">Plan</dt><dd className="font-semibold">{effectiveName} · {cadenceLabel(interval)}</dd></div>
          <div><dt className="text-zinc-500">Recurring total</dt><dd className="font-semibold tabular-nums">EC${formatCents(cycleTotalCents)} per {unit} · {services.length} service{services.length === 1 ? "" : "s"}</dd></div>
          <div><dt className="text-zinc-500">{alignment === "align_to_renewal" ? "Starts → joins renewal" : "Starts → first renewal"}</dt><dd className="font-semibold">{displayDate(startDate)} → {displayDate(nextBillingDate)}</dd></div>
          <div><dt className="text-zinc-500">Billing method</dt><dd className="font-semibold">{collection === "stripe_autocharge" ? "Card billing (Stripe), not connected" : "Manual invoice"}</dd></div>
          <div><dt className="text-zinc-500">Hardware</dt><dd className="font-semibold">{services.filter((service) => service.deviceId).length} of {services.length} assigned</dd></div>
        </dl>
        <ul className="mt-4 divide-y divide-emerald-200 rounded-lg bg-white text-sm dark:divide-zinc-800 dark:bg-zinc-900">
          {services.map((service, index) => (
            <li key={service.key} className="flex flex-col gap-1 p-3 sm:flex-row sm:justify-between">
              <span className="font-medium">{service.label.trim() || `Service ${index + 1}`}</span>
              <span className="tabular-nums text-zinc-600 dark:text-zinc-300">EC${computed[index].cents != null ? formatCents(computed[index].cents!) : "—"} per {unit}{computed[index].proration && computed[index].proration!.amountCents > 0 ? ` · partial period EC$${computed[index].proration!.amount} agreed, not invoiced` : ""}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-emerald-950 dark:text-emerald-100">Creating saves a <strong>draft</strong>: the customer if new, the subscription, service prices, hardware links and any agreed partial-period amounts. It does not activate billing, create an invoice, contact Stripe, or notify anyone. Activation is a separate, explicit step on the next screen. Submitting twice cannot create it twice.</p>
      </section>

      {stepError ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{stepError}</p> : null}
      {state.error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
      {state.message ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{state.message}</p> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" disabled={step === 0} onClick={() => { setStepError(null); setStep((current) => Math.max(0, current - 1)); }} className="min-h-11 rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold disabled:invisible dark:border-zinc-700">Back</button>
        {step < steps.length - 1 ? (
          <button type="button" onClick={goNext} className="min-h-11 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white">Continue</button>
        ) : (
          <button type="submit" disabled={pending || Boolean(state.next)} className="min-h-11 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Creating draft…" : "Create draft"}</button>
        )}
      </div>
    </form>
  );
}
