"use client";

import { useActionState, useState } from "react";

import { activateCanonicalManualSubscriptionAction, type CanonicalSubscriptionFormState } from "@/app/admin/subscriptions/canonical/actions";
import { addMonthsClamped } from "@/lib/domain/subscription-proration";

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-950";

type Charge = { key: number; description: string; quantity: string; unitPrice: string };

export function CanonicalManualActivationForm({
  subscriptionId,
  commercialStartDate,
  nextBillingDate,
  gracePeriodDays,
  cycleTotal,
  serviceCount,
  billingIntervalMonths,
}: {
  subscriptionId: string;
  commercialStartDate: string;
  nextBillingDate: string;
  gracePeriodDays: number;
  cycleTotal: string | null;
  serviceCount: number;
  billingIntervalMonths?: number | null;
}) {
  const [state, action, pending] = useActionState(activateCanonicalManualSubscriptionAction, initialState);
  // A subscription aligned to an existing renewal starts part-way through the cycle.
  // A full-interval advance invoice would over-bill it, so deferral is the safe default;
  // the agreed partial-period amount is handled on the details screen, never inferred.
  const partialFirstPeriod = Boolean(
    billingIntervalMonths && commercialStartDate && nextBillingDate
    && addMonthsClamped(nextBillingDate, -billingIntervalMonths) < commercialStartDate,
  );
  const [mode, setMode] = useState<"advance_invoice" | "deferred">(partialFirstPeriod ? "deferred" : "advance_invoice");
  const [charges, setCharges] = useState<Charge[]>([]);
  const chargeTotal = charges.reduce((total, charge) => total + (Number(charge.quantity) || 0) * (Number(charge.unitPrice) || 0), 0);

  return <form action={action} className="mt-5 space-y-5">
    <input type="hidden" name="subscriptionId" value={subscriptionId} />
    <div><h3 className="font-semibold">Activation review</h3><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Activation records staff approval and starts one future recurring schedule. It does not record a payment or contact the customer.</p></div>
    {partialFirstPeriod ? <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">This subscription starts part-way through its billing cycle, so a full-period invoice would over-bill. Deferral is pre-selected. Any agreed partial-period charge stays on the subscription page and is invoiced separately, only on your explicit confirmation.</p> : null}
    <dl className="grid gap-3 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-3 dark:bg-zinc-950"><div><dt className="text-zinc-500">Services</dt><dd className="mt-1 font-semibold">{serviceCount}</dd></div><div><dt className="text-zinc-500">Recurring cycle</dt><dd className="mt-1 font-semibold tabular-nums">{cycleTotal ? `EC$${cycleTotal}` : "Unavailable"}</dd></div><div><dt className="text-zinc-500">Next renewal</dt><dd className="mt-1 font-semibold">{nextBillingDate || "Required"}</dd></div></dl>

    <fieldset className="space-y-3"><legend className="sr-only">Initial billing decision</legend><label className={`flex min-h-20 cursor-pointer gap-3 rounded-lg border p-4 text-sm transition-colors ${mode === "advance_invoice" ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}><input className="mt-1 size-5 accent-emerald-700" type="radio" name="initialBillingMode" value="advance_invoice" checked={mode === "advance_invoice"} onChange={() => setMode("advance_invoice")} /><span><strong>Invoice first service period now</strong><br /><span className="mt-1 block text-zinc-500">Creates one open invoice for the coverage period. No delivery or payment is made automatically.</span></span></label><label className={`flex min-h-20 cursor-pointer gap-3 rounded-lg border p-4 text-sm transition-colors ${mode === "deferred" ? "border-emerald-400 bg-emerald-50/70 dark:border-emerald-700 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}><input className="mt-1 size-5 accent-emerald-700" type="radio" name="initialBillingMode" value="deferred" checked={mode === "deferred"} onChange={() => setMode("deferred")} /><span><strong>Defer first invoice until next renewal</strong><br /><span className="mt-1 block text-zinc-500">No invoice is created now. The first invoice is generated on the configured renewal date.</span></span></label></fieldset>

    {mode === "advance_invoice" ? <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium">Invoice issue date<input required type="date" name="initialInvoiceIssueDate" defaultValue={commercialStartDate} className={inputClass} /></label><label className="text-sm font-medium">Coverage starts<input required type="date" name="initialPeriodStart" defaultValue={commercialStartDate} className={inputClass} /></label><label className="text-sm font-medium">Coverage ends / renewal<input required type="date" name="initialPeriodEnd" defaultValue={nextBillingDate} className={inputClass} /></label><label className="text-sm font-medium">Payment due in days<input required name="initialInvoiceDueDays" type="number" min="0" max="365" defaultValue={gracePeriodDays} className={inputClass} /></label></div><p className="-mt-2 text-xs text-zinc-500">Coverage must be one complete billing interval and end on the configured next billing date. The current recurring schedule begins at that renewal, preventing an overlap.</p><div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"><div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">One-time installation, setup, or hardware charges</h4><p className="mt-1 text-xs text-zinc-500">Optional. These appear only on the initial invoice and do not change the recurring service total.</p></div><button type="button" onClick={() => setCharges((value) => [...value, { key: Date.now() + value.length, description: "", quantity: "1", unitPrice: "" }])} className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">Add charge</button></div>{charges.map((charge, index) => <div key={charge.key} className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_120px_auto]"><input required name="initialChargeDescription" value={charge.description} onChange={(event) => setCharges((value) => value.map((item) => item.key === charge.key ? { ...item, description: event.target.value } : item))} className={inputClass} placeholder="Installation or hardware" /><input required name="initialChargeQuantity" value={charge.quantity} inputMode="decimal" onChange={(event) => setCharges((value) => value.map((item) => item.key === charge.key ? { ...item, quantity: event.target.value } : item))} className={inputClass} placeholder="Qty" /><input required name="initialChargeUnitPrice" value={charge.unitPrice} inputMode="decimal" onChange={(event) => setCharges((value) => value.map((item) => item.key === charge.key ? { ...item, unitPrice: event.target.value } : item))} className={inputClass} placeholder="EC$ each" /><button type="button" aria-label={`Remove charge ${index + 1}`} onClick={() => setCharges((value) => value.filter((item) => item.key !== charge.key))} className="mt-1 rounded-lg px-3 py-2 text-sm font-semibold text-red-700">Remove</button></div>)}{charges.length ? <p className="mt-3 text-right text-sm font-semibold tabular-nums">One-time charges: EC${chargeTotal.toFixed(2)}</p> : null}</div></> : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Deferral does not mark the customer paid and cannot include setup or hardware charges. Record the reason below; staff may create a separate approved one-off invoice later if needed.</p>}

    <label className="block text-sm font-medium">Staff note<textarea required name="confirmationNote" rows={3} className={inputClass} placeholder="Add the agreed terms, installation outcome, or billing context." /></label>
    <div className="grid gap-2 text-sm sm:grid-cols-3"><label className="flex items-start gap-2"><input required type="checkbox" name="confirmCommercial" value="yes" className="mt-1" /><span>Service prices, interval, and dates match the agreement.</span></label><label className="flex items-start gap-2"><input required type="checkbox" name="confirmHardware" value="yes" className="mt-1" /><span>Assigned hardware and service ownership were reviewed.</span></label><label className="flex items-start gap-2"><input required type="checkbox" name="confirmInitialBilling" value="yes" className="mt-1" /><span>The initial invoice or explicit deferral has been approved.</span></label></div>
    {state.error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
    {state.message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{state.message}</p> : null}
    <button disabled={pending} className="min-h-11 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 sm:w-auto">{pending ? "Activating…" : mode === "advance_invoice" ? "Approve and activate with initial invoice" : "Approve and activate with deferred billing"}</button>
  </form>;
}
