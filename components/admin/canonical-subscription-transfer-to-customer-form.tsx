"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";

import {
  transferCanonicalServiceToCustomerAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";
import { QuickCustomerPicker, type QuickSendCustomer } from "@/components/admin/quick-customer-picker";
import { canonicalIntervalLabel } from "@/lib/domain/canonical-subscription-admin";
import { SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS } from "@/lib/domain/canonical-subscription";
import { cycleUnitLabel } from "@/lib/domain/subscription-proration";
import type { TransferToCustomerPageData } from "@/lib/admin/canonical-subscription-page-data";
import { subscriptionServicePath } from "@/lib/domain/canonical-subscription-navigation";

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950";
const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";
const steps = ["Customer", "Destination", "Review"] as const;

function displayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

function currencyPrefix(currency: string) {
  return currency === "XCD" ? "EC$" : `${currency} `;
}

export function TransferToCustomerForm({ data }: { data: TransferToCustomerPageData }) {
  const [state, action, pending] = useActionState(transferCanonicalServiceToCustomerAction, initialState);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [createCustomer, setCreateCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<QuickSendCustomer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ company: "", firstName: "", lastName: "", email: "", phone: "" });
  const [destinationMode, setDestinationMode] = useState<"new_agreement" | "existing_agreement">("new_agreement");
  const [targetSubscriptionId, setTargetSubscriptionId] = useState("");
  const [name, setName] = useState(data.sourceSubscriptionLabel);
  const [billingIntervalMonths, setBillingIntervalMonths] = useState(String(data.billingIntervalMonths || 1));
  const [commercialStartDate, setCommercialStartDate] = useState(data.commercialStartDate);
  const [nextBillingDate, setNextBillingDate] = useState(data.nextBillingDate);
  const [transferDate, setTransferDate] = useState("");
  const [amount, setAmount] = useState(data.currentAmount);
  const [classification, setClassification] = useState("negotiated");
  const [changeReason, setChangeReason] = useState("");

  useEffect(() => {
    if (state.next) window.location.assign(state.next);
  }, [state.next]);

  const destAgreements = useMemo(
    () => (selectedCustomer ? data.agreementsByCustomerId[selectedCustomer.id] ?? [] : []),
    [data.agreementsByCustomerId, selectedCustomer],
  );
  const destAgreement = destAgreements.find((option) => option.id === targetSubscriptionId);
  const destCustomerLabel = createCustomer
    ? (newCustomer.company.trim() || [newCustomer.firstName, newCustomer.lastName].filter(Boolean).join(" ").trim() || "New customer")
    : selectedCustomer?.name ?? "";

  useEffect(() => {
    if (createCustomer || destAgreements.length === 0) {
      setDestinationMode("new_agreement");
      setTargetSubscriptionId("");
    }
  }, [createCustomer, destAgreements.length]);

  function validateStep(index: number): string | null {
    if (index === 0) {
      if (createCustomer) {
        if (!newCustomer.company.trim() && !(newCustomer.firstName.trim() && newCustomer.lastName.trim())) {
          return "Enter a company name, or both a first and last name.";
        }
      } else if (!selectedCustomer) {
        return "Choose the customer who will own this service.";
      }
    }
    if (index === 1) {
      if (!transferDate) return "Enter the transfer date.";
      if (!amount.trim()) return "Enter the successor cycle amount.";
      if (!changeReason.trim() || changeReason.trim().length < 3) return "Give a short commercial reason (at least 3 characters).";
      if (destinationMode === "existing_agreement") {
        if (!targetSubscriptionId) return "Choose the destination agreement, or create a new one.";
      } else {
        if (!name.trim()) return "Name the new agreement.";
        if (!commercialStartDate) return "Enter the start date.";
        if (!nextBillingDate) return "Enter the next renewal date.";
      }
    }
    return null;
  }

  function goNext() {
    const problem = validateStep(step);
    setStepError(problem);
    if (!problem) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  const backHref = subscriptionServicePath(data.subscriptionId, data.itemId);
  const intervalLabel = canonicalIntervalLabel(Number(billingIntervalMonths));
  const destSummary = destinationMode === "existing_agreement"
    ? `${destAgreement?.label ?? "Chosen agreement"} · joins ${destAgreement?.nextBillingDate ? displayDate(destAgreement.nextBillingDate) : "that agreement’s next renewal"}`
    : `New ${intervalLabel.toLowerCase()} agreement · renews ${nextBillingDate ? displayDate(nextBillingDate) : "on the chosen date"}`;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (step !== steps.length - 1) {
          event.preventDefault();
          goNext();
        }
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="subscriptionId" value={data.subscriptionId} />
      <input type="hidden" name="subscriptionItemId" value={data.itemId} />
      <input type="hidden" name="destinationMode" value={destinationMode} />
      <input type="hidden" name="customerId" value={createCustomer ? "" : selectedCustomer?.id ?? ""} />
      <input type="hidden" name="newCustomerCompany" value={newCustomer.company} />
      <input type="hidden" name="newCustomerFirstName" value={newCustomer.firstName} />
      <input type="hidden" name="newCustomerLastName" value={newCustomer.lastName} />
      <input type="hidden" name="newCustomerEmail" value={newCustomer.email} />
      <input type="hidden" name="newCustomerPhone" value={newCustomer.phone} />
      <input type="hidden" name="targetSubscriptionId" value={targetSubscriptionId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="billingIntervalMonths" value={billingIntervalMonths} />
      <input type="hidden" name="commercialStartDate" value={commercialStartDate} />
      <input type="hidden" name="nextBillingDate" value={nextBillingDate} />
      <input type="hidden" name="transferDate" value={transferDate} />
      <input type="hidden" name="agreedAmountPerCycle" value={amount} />
      <input type="hidden" name="classification" value={classification} />
      <input type="hidden" name="changeReason" value={changeReason} />

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-semibold">{data.serviceLabel}</p>
        <p className="mt-1 text-zinc-500">From {data.sourceCustomerLabel} · {data.sourceSubscriptionLabel}. Historical invoices stay with {data.sourceCustomerLabel}.</p>
      </section>

      <ol className="flex flex-col gap-2 text-xs font-semibold sm:flex-row" aria-label="Progress">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={`flex-1 rounded-lg px-3 py-2 text-center ${index === step ? "bg-emerald-700 text-white" : index < step ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>{index + 1}. {label}</li>
        ))}
      </ol>

      <section hidden={step !== 0} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Destination customer</h2>
        <p className="mt-1 text-sm text-zinc-500">The vehicle, tracker and SIM move to this customer. {data.sourceCustomerLabel} keeps past invoices.</p>
        {createCustomer ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Company<input value={newCustomer.company} onChange={(event) => setNewCustomer((current) => ({ ...current, company: event.target.value }))} className={inputClass} placeholder="Blue Taxi Ltd" /></label>
            <label className="text-sm font-medium">First name<input value={newCustomer.firstName} onChange={(event) => setNewCustomer((current) => ({ ...current, firstName: event.target.value }))} className={inputClass} /></label>
            <label className="text-sm font-medium">Last name<input value={newCustomer.lastName} onChange={(event) => setNewCustomer((current) => ({ ...current, lastName: event.target.value }))} className={inputClass} /></label>
            <label className="text-sm font-medium">Billing email<input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} className={inputClass} placeholder="accounts@example.com" /></label>
            <label className="text-sm font-medium">Mobile / WhatsApp<input value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} className={inputClass} /></label>
          </div>
        ) : (
          <div className="mt-4">
            <span className="text-sm font-medium">Customer</span>
            <div className="mt-1">
              <QuickCustomerPicker
                customers={data.customers}
                selected={selectedCustomer}
                onSelect={setSelectedCustomer}
                searchHint="Search by name, company, email or phone"
                emptyHint="No matching customer. Create a new customer instead."
              />
            </div>
          </div>
        )}
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          onClick={() => {
            setCreateCustomer((current) => !current);
            setSelectedCustomer(null);
          }}
        >
          {createCustomer ? "Choose an existing customer" : "Create a new customer"}
        </button>
      </section>

      <section hidden={step !== 1} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Where this service will bill</h2>
        <fieldset className="mt-4 grid gap-2">
          <legend className="text-sm font-semibold">Destination agreement</legend>
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${destinationMode === "new_agreement" ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
            <input type="radio" name="destinationChoice" checked={destinationMode === "new_agreement"} onChange={() => setDestinationMode("new_agreement")} className="mt-1" />
            <span>
              <span className="block font-medium">Create a new agreement</span>
              <span className="block text-xs text-zinc-500">Own renewal date and price. Nothing has been invoiced yet, so you can still correct dates after the transfer.</span>
            </span>
          </label>
          <label className={`flex items-start gap-3 rounded-lg border p-3 ${destAgreements.length === 0 || createCustomer ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${destinationMode === "existing_agreement" ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
            <input
              type="radio"
              name="destinationChoice"
              checked={destinationMode === "existing_agreement"}
              onChange={() => setDestinationMode("existing_agreement")}
              disabled={destAgreements.length === 0 || createCustomer}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">Add to an existing agreement</span>
              <span className="block text-xs text-zinc-500">
                {createCustomer
                  ? "A new customer has no agreements yet."
                  : destAgreements.length === 0
                    ? "This customer has no open recurring-invoice agreement."
                    : "The service joins that agreement’s next renewal. Dates cannot be changed independently if it has already been invoiced."}
              </span>
            </span>
          </label>
        </fieldset>

        {destinationMode === "existing_agreement" ? (
          <label className="mt-4 block text-sm font-medium">Existing agreement
            <select value={targetSubscriptionId} onChange={(event) => setTargetSubscriptionId(event.target.value)} className={inputClass}>
              <option value="">Choose agreement</option>
              {destAgreements.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} · {option.intervalLabel} · {option.nextBillingDate ? `renews ${displayDate(option.nextBillingDate)}` : "no renewal date"}{option.billed ? " · already invoiced" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Agreement name<input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-medium">Billing interval
              <select value={billingIntervalMonths} onChange={(event) => setBillingIntervalMonths(event.target.value)} className={inputClass}>
                {SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS.map((months) => (
                  <option key={months} value={months}>{canonicalIntervalLabel(months)}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">Start date<input type="date" value={commercialStartDate} onChange={(event) => setCommercialStartDate(event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-medium">Next renewal date<input type="date" value={nextBillingDate} onChange={(event) => setNextBillingDate(event.target.value)} className={inputClass} /></label>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Transfer date<input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-medium">Successor cycle amount ({currencyPrefix(data.currency)})<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} /></label>
          <label className="text-sm font-medium">Price type
            <select value={classification} onChange={(event) => setClassification(event.target.value)} className={inputClass}>
              <option value="negotiated">Negotiated</option>
              <option value="standard">Standard</option>
            </select>
          </label>
          <label className="text-sm font-medium">Commercial reason<input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} className={inputClass} placeholder="Vehicle sold to this customer" /></label>
        </div>
        <p className="mt-3 text-xs text-zinc-500">The new agreement always uses a recurring invoice. A card on the previous customer does not move.</p>
      </section>

      <section hidden={step !== 2} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Review transfer</h2>
        <dl className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-700">
          {([
            ["Service", data.serviceLabel],
            ["From", `${data.sourceCustomerLabel} · ${data.sourceSubscriptionLabel}`],
            ["To", destCustomerLabel],
            ["Agreement", destSummary],
            ["Transfer date", transferDate ? displayDate(transferDate) : "—"],
            ["Successor price", `${currencyPrefix(data.currency)}${amount} per ${cycleUnitLabel(Number(billingIntervalMonths))} · ${classification === "standard" ? "Standard" : "Negotiated"}`],
            ["Reason", changeReason || "—"],
          ] as const).map(([term, detail]) => (
            <div key={term} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-3 py-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <dt className="text-zinc-500">{term}</dt>
              <dd className="min-w-0 break-words font-medium">{detail}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 list-disc space-y-1 rounded-lg bg-zinc-50 px-3 py-3 pl-7 text-sm text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          <li>If this service is already billing, it ends here on the transfer date. If it has not started billing yet, it is canceled here with no charge.</li>
          <li>{destinationMode === "existing_agreement" ? "A successor service starts under the chosen agreement and joins that agreement’s next renewal." : "A new draft agreement starts for the destination customer. Review dates and prices there, then mark it active."}</li>
          <li>The tracker and its SIM move with the service.</li>
          <li>Historical invoices are not rewritten. Nothing is invoiced, charged, or emailed as part of this transfer.</li>
          {destinationMode === "existing_agreement" && destAgreement?.billed ? <li>That agreement has already been invoiced, so its renewal date cannot be corrected from Billing.</li> : null}
        </ul>
      </section>

      {stepError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{stepError}</p> : null}
      {state.error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {step === 0 ? <Link href={backHref} className={secondaryButton}>Cancel</Link> : <button type="button" onClick={() => { setStepError(null); setStep((current) => current - 1); }} className={secondaryButton}>Back</button>}
        {step < steps.length - 1
          ? <button type="submit" className={primaryButton}>Continue</button>
          : <button type="submit" disabled={pending || Boolean(state.next)} className={primaryButton}>{pending ? "Transferring…" : "Confirm transfer"}</button>}
      </div>
    </form>
  );
}
