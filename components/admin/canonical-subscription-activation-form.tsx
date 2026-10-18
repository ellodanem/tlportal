"use client";

import { useActionState, useState } from "react";

import { activateCanonicalManualSubscriptionAction, type CanonicalSubscriptionFormState } from "@/app/admin/subscriptions/canonical/actions";

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
}: {
  subscriptionId: string;
  commercialStartDate: string;
  nextBillingDate: string;
  gracePeriodDays: number;
  cycleTotal: string | null;
  serviceCount: number;
}) {
  const [state, action, pending] = useActionState(activateCanonicalManualSubscriptionAction, initialState);
  const [mode, setMode] = useState<"advance_invoice" | "deferred">("advance_invoice");
  const [charges, setCharges] = useState<Charge[]>([]);
  const chargeTotal = charges.reduce((total, charge) => total + (Number(charge.quantity) || 0) * (Number(charge.unitPrice) || 0), 0);

  return <form action={action} className="mt-4 space-y-5 rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-zinc-900">
    <input type="hidden" name="subscriptionId" value={subscriptionId} />
    <div><h3 className="font-semibold">Staff activation review</h3><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Activation writes an auditable staff approval, activates the services, and owns exactly one future recurring schedule. It never records a payment, contacts Stripe, or sends email or WhatsApp.</p></div>
    <dl className="grid gap-3 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-3 dark:bg-zinc-950"><div><dt className="text-zinc-500">Services</dt><dd className="mt-1 font-semibold">{serviceCount}</dd></div><div><dt className="text-zinc-500">Recurring cycle</dt><dd className="mt-1 font-semibold tabular-nums">{cycleTotal ? `EC$${cycleTotal}` : "Unavailable"}</dd></div><div><dt className="text-zinc-500">Next renewal</dt><dd className="mt-1 font-semibold">{nextBillingDate || "Required"}</dd></div></dl>

    <fieldset className="space-y-3"><legend className="font-semibold text-sm">Initial billing decision</legend><label className="flex gap-2 rounded-lg border border-emerald-200 p-3 text-sm"><input type="radio" name="initialBillingMode" value="advance_invoice" checked={mode === "advance_invoice"} onChange={() => setMode("advance_invoice")} /><span><strong>Invoice the first service period now</strong><br /><span className="text-zinc-500">Creates one open native invoice for the explicit coverage period. No delivery or payment is made automatically.</span></span></label><label className="flex gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700"><input type="radio" name="initialBillingMode" value="deferred" checked={mode === "deferred"} onChange={() => setMode("deferred")} /><span><strong>Defer the first invoice</strong><br /><span className="text-zinc-500">Records that deferral is intentional; the first invoice is generated only on the configured renewal date.</span></span></label></fieldset>

    {mode === "advance_invoice" ? <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium">Invoice issue date<input required type="date" name="initialInvoiceIssueDate" defaultValue={commercialStartDate} className={inputClass} /></label><label className="text-sm font-medium">Coverage starts<input required type="date" name="initialPeriodStart" defaultValue={commercialStartDate} className={inputClass} /></label><label className="text-sm font-medium">Coverage ends / renewal<input required type="date" name="initialPeriodEnd" defaultValue={nextBillingDate} className={inputClass} /></label><label className="text-sm font-medium">Payment due in days<input required name="initialInvoiceDueDays" type="number" min="0" max="365" defaultValue={gracePeriodDays} className={inputClass} /></label></div><p className="-mt-2 text-xs text-zinc-500">Coverage must be one complete billing interval and end on the configured next billing date. The current recurring schedule begins at that renewal, preventing an overlap.</p><div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"><div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">One-time installation, setup, or hardware charges</h4><p className="mt-1 text-xs text-zinc-500">Optional. These appear only on the initial invoice and do not change the recurring service total.</p></div><button type="button" onClick={() => setCharges((value) => [...value, { key: Date.now() + value.length, description: "", quantity: "1", unitPrice: "" }])} className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">Add charge</button></div>{charges.map((charge, index) => <div key={charge.key} className="mt-3 grid gap-2 sm:grid-cols-[1fr_100px_120px_auto]"><input required name="initialChargeDescription" value={charge.description} onChange={(event) => setCharges((value) => value.map((item) => item.key === charge.key ? { ...item, description: event.target.value } : item))} className={inputClass} placeholder="Installation or hardware" /><input required name="initialChargeQuantity" value={charge.quantity} inputMode="decimal" onChange={(event) => setCharges((value) => value.map((item) => item.key === charge.key ? { ...item, quantity: event.target.value } : item))} className={inputClass} placeholder="Qty" /><input required name="initialChargeUnitPrice" value={charge.unitPrice} inputMode="decimal" onChange={(event) => setCharges((value) => value.map((item) => item.key === charge.key ? { ...item, unitPrice: event.target.value } : item))} className={inputClass} placeholder="EC$ each" /><button type="button" aria-label={`Remove charge ${index + 1}`} onClick={() => setCharges((value) => value.filter((item) => item.key !== charge.key))} className="mt-1 rounded-lg px-3 py-2 text-sm font-semibold text-red-700">Remove</button></div>)}{charges.length ? <p className="mt-3 text-right text-sm font-semibold tabular-nums">One-time charges: EC${chargeTotal.toFixed(2)}</p> : null}</div></> : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Deferral does not mark the customer paid and cannot include setup or hardware charges. Record the reason below; staff may create a separate approved one-off invoice later if needed.</p>}

    <label className="block text-sm font-medium">Staff review note<textarea required name="confirmationNote" rows={3} className={inputClass} placeholder="Confirmed commercial terms, installation outcome, and first-billing decision." /></label>
    <div className="grid gap-2 text-sm sm:grid-cols-3"><label className="flex items-start gap-2"><input required type="checkbox" name="confirmCommercial" value="yes" className="mt-1" /><span>Service prices, interval, and dates match the agreement.</span></label><label className="flex items-start gap-2"><input required type="checkbox" name="confirmHardware" value="yes" className="mt-1" /><span>Assigned hardware and service ownership were reviewed.</span></label><label className="flex items-start gap-2"><input required type="checkbox" name="confirmInitialBilling" value="yes" className="mt-1" /><span>The initial invoice or explicit deferral has been approved.</span></label></div>
    {state.error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
    {state.message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{state.message}</p> : null}
    <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Activating…" : mode === "advance_invoice" ? "Approve and activate with initial invoice" : "Approve and activate with deferred billing"}</button>
  </form>;
}
