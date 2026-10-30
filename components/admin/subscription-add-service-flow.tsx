"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { addServiceAction, type CanonicalSubscriptionFormState } from "@/app/admin/subscriptions/canonical/actions";
import {
  cadenceLabel,
  computeProration,
  cycleUnitLabel,
  formatCents,
  parseMoneyToCents,
  type SubscriptionProrationMethod,
} from "@/lib/domain/subscription-proration";
import type { ServiceAdditionContext } from "@/lib/services/subscription-service-addition-service";

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950";
const steps = ["Service & price", "Hardware", "Review"] as const;

type AdjustmentChoice = "none" | SubscriptionProrationMethod;

function money(cents: number, currency: string) {
  return `${currency === "XCD" ? "EC$" : `${currency} `}${formatCents(cents)}`;
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

/** Searchable, scrollable device list. Posts the selection as `deviceId`. */
function DevicePicker({
  devices,
  value,
  onChange,
}: {
  devices: ServiceAdditionContext["availableDevices"];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? devices.filter((device) => `${device.label} ${device.imei} ${device.simLabel ?? ""} ${device.iccid ?? ""}`.toLowerCase().includes(needle))
    : devices;

  return (
    <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <span className="text-xs text-zinc-500">Choose from available hardware</span>
        <a
          href="/admin/devices"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          Open Devices ↗
        </a>
      </div>
      <input type="hidden" name="deviceId" value={value} />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        placeholder="Search by name, IMEI or SIM"
        aria-label="Search available devices"
        className="min-h-10 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950"
      />
      <ul role="listbox" aria-label="Available devices" className="mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-md border border-zinc-100 dark:border-zinc-800">
        {visible.length ? visible.map((device) => {
          const selected = device.id === value;
          return (
            <li key={device.id} role="option" aria-selected={selected}>
              <button
                type="button"
                onClick={() => onChange(device.id)}
                className={`flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${selected ? "bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
              >
                <span className="min-w-0 break-words">{device.label} <span className="text-xs font-normal text-zinc-500">· {device.imei}</span></span>
                <span className="text-xs font-normal text-zinc-500">{device.simLabel ?? "no SIM"}</span>
              </button>
            </li>
          );
        }) : <li className="px-3 py-4 text-center text-sm text-zinc-500">No devices match “{query}”.</li>}
      </ul>
      <p className="mt-2 px-1 text-xs text-zinc-500">{value ? `Selected: ${devices.find((device) => device.id === value)?.label ?? "device"}` : `${visible.length} of ${devices.length} shown`}</p>
    </div>
  );
}

export function SubscriptionAddServiceFlow({
  context,
  creationKey,
  today,
}: {
  context: ServiceAdditionContext;
  creationKey: string;
  today: string;
}) {
  const [state, action, pending] = useActionState(addServiceAction, initialState);
  const router = useRouter();
  const { subscription, cycle } = context;
  const currency = subscription.currency;
  const defaultStart = today < cycle.cycleStart ? cycle.cycleStart : today > subscription.nextBillingDate ? subscription.nextBillingDate : today;

  const [step, setStep] = useState(0);
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [price, setPrice] = useState(context.suggestedPrice);
  const [classification, setClassification] = useState<"standard" | "negotiated">("standard");
  const [startDate, setStartDate] = useState(defaultStart);
  const [adjustment, setAdjustment] = useState<AdjustmentChoice>("daily_proration");
  const [manualAmount, setManualAmount] = useState("");
  const [reason, setReason] = useState("");
  const [hardwareKind, setHardwareKind] = useState<"none" | "device" | "assignment">("none");
  const [deviceId, setDeviceId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [notes, setNotes] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => { if (state.next) router.push(state.next); }, [router, state.next]);

  const priceCents = useMemo(() => {
    try { return parseMoneyToCents(price || "0"); } catch { return null; }
  }, [price]);

  const proration = useMemo(() => {
    if (adjustment === "none" || priceCents == null || priceCents <= 0) return { result: null, error: null as string | null };
    try {
      return {
        result: computeProration({
          startDate,
          renewalDate: subscription.nextBillingDate,
          billingIntervalMonths: subscription.billingIntervalMonths,
          cycleAmount: formatCents(priceCents),
          currency,
          method: adjustment,
          manualAmount: adjustment === "manual_amount" ? manualAmount : null,
          reason,
        }),
        error: null as string | null,
      };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : "Check the adjustment." };
    }
  }, [adjustment, priceCents, startDate, subscription.nextBillingDate, subscription.billingIntervalMonths, currency, manualAmount, reason]);

  const existingCents = context.currentRecurringCents;
  const futureCents = existingCents + (priceCents ?? 0);
  const selectedDevice = context.availableDevices.find((device) => device.id === deviceId);
  const selectedAssignment = context.unlinkedAssignments.find((assignment) => assignment.id === assignmentId);
  const unit = cycleUnitLabel(subscription.billingIntervalMonths);

  function chooseDevice(id: string) {
    setDeviceId(id);
    const device = context.availableDevices.find((candidate) => candidate.id === id);
    if (device && (!label.trim() || !labelTouched)) setLabel(device.label);
  }

  function validateStep(index: number): string | null {
    if (index === 0) {
      if (!label.trim()) return "Give the service a name, such as the vehicle or asset.";
      if (priceCents == null || priceCents <= 0) return "Enter the agreed price for one billing cycle.";
      if (startDate < cycle.cycleStart || startDate > subscription.nextBillingDate) return `The start date must be between ${displayDate(cycle.cycleStart)} and ${displayDate(subscription.nextBillingDate)}.`;
      if (adjustment !== "none" && proration.error) return proration.error;
    }
    if (index === 1) {
      if (hardwareKind === "device" && !deviceId) return "Choose a device, or select “No hardware yet”.";
      if (hardwareKind === "assignment" && !assignmentId) return "Choose a device assignment, or select “No hardware yet”.";
    }
    return null;
  }

  function goNext() {
    const problem = validateStep(step);
    setStepError(problem);
    if (!problem) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  if (context.blockedReason) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-semibold">Services can’t be added here yet</p>
        <p className="mt-1">{context.blockedReason}</p>
        <Link href={`/admin/subscriptions/canonical/${subscription.id}`} className="mt-3 inline-block font-semibold underline">Back to subscription</Link>
      </div>
    );
  }

  return (
    <form action={action} className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <input type="hidden" name="subscriptionId" value={subscription.id} />
      <input type="hidden" name="creationKey" value={creationKey} />
      <input type="hidden" name="hardwareKind" value={hardwareKind} />
      <input type="hidden" name="adjustmentMethod" value={adjustment} />

      <section aria-label="Subscription context" className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="font-semibold">{subscription.customerLabel} · {cadenceLabel(subscription.billingIntervalMonths)} subscription</p>
        <p className="mt-1 text-zinc-500">The new service inherits this subscription’s billing cycle and renews on {displayDate(subscription.nextBillingDate)}. Current recurring total: <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{money(existingCents, currency)}</span> per {unit}.</p>
      </section>

      <ol className="flex gap-2 text-xs font-semibold" aria-label="Progress">
        {steps.map((name, index) => (
          <li key={name} aria-current={index === step ? "step" : undefined} className={`flex-1 rounded-lg px-3 py-2 text-center ${index === step ? "bg-emerald-700 text-white" : index < step ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>{index + 1}. {name}</li>
        ))}
      </ol>

      <section hidden={step !== 0} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Service & price</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Vehicle / asset name
            <input name="label" value={label} onChange={(event) => { setLabel(event.target.value); setLabelTouched(true); }} className={inputClass} placeholder="Toyota Hilux – SLG 4821" />
          </label>
          <label className="text-sm font-medium">Price per {unit} ({currency})
            <input name="agreedAmountPerCycle" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} />
            {context.suggestedPrice ? <span className="mt-1 block text-xs font-normal text-zinc-500">Pre-filled from the last service on this subscription. Change it for a different agreed rate.</span> : null}
          </label>
          <label className="text-sm font-medium">Price type
            <select name="classification" value={classification} onChange={(event) => setClassification(event.target.value as "standard" | "negotiated")} className={inputClass}>
              <option value="standard">Standard</option>
              <option value="negotiated">Negotiated</option>
            </select>
          </label>
          <label className="text-sm font-medium">Service start date
            <input type="date" name="startDate" value={startDate} min={cycle.cycleStart} max={subscription.nextBillingDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass} />
          </label>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">Charge for the time before the next renewal</legend>
          <p className="mt-1 text-xs text-zinc-500">The service starts {startDate ? displayDate(startDate) : "on the start date"} and joins the full {unit} price on {displayDate(subscription.nextBillingDate)}. This only records what was agreed — it does not create an invoice.</p>
          <div className="mt-3 grid gap-2 text-sm">
            {([
              ["daily_proration", "Prorate by days", "Charge only the days remaining until the renewal."],
              ["monthly_rounded", "Round to whole months", "Charge the monthly equivalent for rounded months; a reason is recorded."],
              ["manual_amount", "Agreed amount", "Enter the exact amount agreed with the customer; a reason is recorded."],
              ["none", "No partial-period charge", "The service simply starts billing at the next renewal."],
            ] as const).map(([value, title, hint]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${adjustment === value ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
                <input type="radio" name="adjustmentChoice" checked={adjustment === value} onChange={() => setAdjustment(value)} className="mt-1" />
                <span><span className="block font-medium">{title}</span><span className="block text-xs text-zinc-500">{hint}</span></span>
              </label>
            ))}
          </div>
          {adjustment === "manual_amount" ? (
            <label className="mt-3 block text-sm font-medium">Agreed amount ({currency})
              <input name="adjustmentAmount" inputMode="decimal" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} className={inputClass} />
            </label>
          ) : null}
          {adjustment === "manual_amount" || adjustment === "monthly_rounded" ? (
            <label className="mt-3 block text-sm font-medium">Reason for this amount
              <input name="adjustmentReason" value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass} placeholder="e.g. Agreed with customer: 4 months at the monthly rate" />
            </label>
          ) : null}
          {adjustment !== "none" ? (
            <div aria-live="polite" className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
              {proration.result ? (
                <>
                  <p className="font-semibold">Partial-period amount: <span className="tabular-nums">{money(proration.result.amountCents, currency)}</span></p>
                  <p className="mt-1 text-xs text-zinc-500">{displayDate(proration.result.startDate)} through {displayDate(proration.result.coveredThrough)} · {proration.result.explanation}</p>
                  {proration.result.isOverride && proration.result.method !== "daily_proration" ? <p className="mt-1 text-xs text-zinc-500">The daily formula would give {money(proration.result.dailyAmountCents, currency)}; the agreed amount replaces it and is recorded as an override.</p> : null}
                </>
              ) : <p className="text-xs text-zinc-500">{proration.error ?? "Enter a price to see the amount."}</p>}
            </div>
          ) : null}
        </fieldset>
        <label className="mt-6 block text-sm font-medium">Internal note (optional)
          <input name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
        </label>
      </section>

      <section hidden={step !== 1} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Hardware</h2>
        <p className="mt-1 text-sm text-zinc-500">Link equipment now or skip it. Hardware can be assigned or replaced later without affecting the price.</p>
        <div className="mt-4 grid gap-2 text-sm">
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${hardwareKind === "none" ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
            <input type="radio" name="hardwareChoice" checked={hardwareKind === "none"} onChange={() => setHardwareKind("none")} className="mt-1" /><span className="font-medium">No hardware yet</span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${hardwareKind === "device" ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
            <input type="radio" name="hardwareChoice" checked={hardwareKind === "device"} onChange={() => setHardwareKind("device")} className="mt-1" /><span><span className="font-medium">Assign an available device</span><span className="block text-xs text-zinc-500">{context.availableDevices.length} unassigned device{context.availableDevices.length === 1 ? "" : "s"} in stock. Its SIM comes with it.</span></span>
          </label>
          {hardwareKind === "device" ? (
            <DevicePicker devices={context.availableDevices} value={deviceId} onChange={chooseDevice} />
          ) : null}
          {context.unlinkedAssignments.length ? (
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${hardwareKind === "assignment" ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
              <input type="radio" name="hardwareChoice" checked={hardwareKind === "assignment"} onChange={() => setHardwareKind("assignment")} className="mt-1" /><span><span className="font-medium">Use a device this customer already has</span><span className="block text-xs text-zinc-500">{context.unlinkedAssignments.length} installed device{context.unlinkedAssignments.length === 1 ? "" : "s"} not yet linked to a service.</span></span>
            </label>
          ) : null}
          {hardwareKind === "assignment" ? (
            <select name="assignmentId" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} className={inputClass} aria-label="Existing device assignment">
              <option value="">Select a device</option>
              {context.unlinkedAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.label}</option>)}
            </select>
          ) : null}
        </div>
      </section>

      <section hidden={step !== 2} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <h2 className="text-lg font-semibold">Review</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-zinc-500">Service</dt><dd className="font-semibold">{label || "—"}</dd></div>
          <div><dt className="text-zinc-500">Price</dt><dd className="font-semibold tabular-nums">{priceCents != null ? money(priceCents, currency) : "—"} per {unit} · {classification}</dd></div>
          <div><dt className="text-zinc-500">Starts</dt><dd className="font-semibold">{displayDate(startDate)}</dd></div>
          <div><dt className="text-zinc-500">Joins full recurring billing</dt><dd className="font-semibold">{displayDate(subscription.nextBillingDate)}</dd></div>
          <div><dt className="text-zinc-500">Hardware</dt><dd className="font-semibold">{hardwareKind === "device" ? selectedDevice?.label ?? "—" : hardwareKind === "assignment" ? selectedAssignment?.label ?? "—" : "None yet"}</dd></div>
          <div><dt className="text-zinc-500">Partial-period charge</dt><dd className="font-semibold tabular-nums">{adjustment === "none" ? "None" : proration.result ? `${money(proration.result.amountCents, currency)} agreed, not invoiced` : "—"}</dd></div>
        </dl>
        <div className="mt-4 rounded-lg bg-white p-3 text-sm dark:bg-zinc-900">
          <p>Recurring total for this subscription: <span className="font-semibold tabular-nums">{money(existingCents, currency)}</span> → <span className="font-semibold tabular-nums">{money(futureCents, currency)}</span> per {unit} from {displayDate(subscription.nextBillingDate)}.</p>
          <p className="mt-1 text-xs text-zinc-500">Other subscriptions of this customer on a different schedule are not included.</p>
        </div>
        <p className="mt-4 text-sm text-emerald-950 dark:text-emerald-100">Saving adds the service, its price, and any hardware link. It does <strong>not</strong> create an invoice, charge anything, change Stripe, or notify the customer. Submitting twice cannot add it twice.</p>
      </section>

      {stepError ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{stepError}</p> : null}
      {state.error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
      {state.message ? <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{state.message}</p> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {step === 0 ? (
          <Link href={`/admin/subscriptions/canonical/${subscription.id}`} className="min-h-11 rounded-lg border border-zinc-300 px-5 py-2.5 text-center text-sm font-semibold dark:border-zinc-700">Cancel</Link>
        ) : (
          <button type="button" onClick={() => { setStepError(null); setStep((current) => current - 1); }} className="min-h-11 rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold dark:border-zinc-700">Back</button>
        )}
        {step < steps.length - 1 ? (
          <button type="button" onClick={goNext} className="min-h-11 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white">Continue</button>
        ) : (
          <button type="submit" disabled={pending || Boolean(state.next)} className="min-h-11 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Adding service…" : "Add service"}</button>
        )}
      </div>
    </form>
  );
}
