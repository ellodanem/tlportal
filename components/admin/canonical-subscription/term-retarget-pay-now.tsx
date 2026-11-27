"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  retargetTermAndPayNowAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";
import { SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS } from "@/lib/domain/canonical-subscription";
import type { TermRetargetInvoice, TermRetargetPanelService } from "@/lib/domain/canonical-term-retarget";
import { cadenceLabel, cycleUnitLabel } from "@/lib/domain/subscription-proration";

const initialState: CanonicalSubscriptionFormState = {};
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

function suggestedAmount(current: string, fromMonths: number, toMonths: number): string {
  const amount = Number(current);
  if (!Number.isFinite(amount) || fromMonths <= 0) return Number(current).toFixed(2);
  if (fromMonths === toMonths) return amount.toFixed(2);
  return (Math.round((amount * toMonths * 100) / fromMonths) / 100).toFixed(2);
}

function money(amount: string, currency: string) {
  if (currency === "XCD") return `EC$${amount}`;
  return `${currency} ${amount}`;
}

export function TermRetargetPayNowForm({
  subscriptionId,
  currentIntervalMonths,
  currency,
  defaultTargetIntervalMonths,
  services,
  openInvoices,
  leftoverSummary,
  requiresExplicitCancel,
  liveSubscriptions,
}: {
  subscriptionId: string;
  currentIntervalMonths: number;
  currency: string;
  defaultTargetIntervalMonths: number;
  services: TermRetargetPanelService[];
  openInvoices: TermRetargetInvoice[];
  leftoverSummary: string | null;
  requiresExplicitCancel: boolean;
  liveSubscriptions: Array<{ id: string; status: string; currentPeriodEnd: string | null }>;
}) {
  const [state, action, pending] = useActionState(retargetTermAndPayNowAction, initialState);
  const router = useRouter();
  const [targetIntervalMonths, setTargetIntervalMonths] = useState(String(defaultTargetIntervalMonths));
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(services.map((service) => [service.id, service.suggestedAmount])),
  );
  const [disposition, setDisposition] = useState(openInvoices.length ? "void" : "");

  useEffect(() => {
    if (state.next) router.push(state.next);
  }, [router, state.next]);

  function chooseInterval(value: string) {
    const months = Number(value);
    setTargetIntervalMonths(value);
    setAmounts(Object.fromEntries(services.map((service) => [
      service.id,
      suggestedAmount(service.currentAmount, service.currentIntervalMonths, months),
    ])));
  }

  const targetMonths = Number(targetIntervalMonths);
  const cycleTotal = useMemo(
    () => services.reduce((total, service) => total + (Number(amounts[service.id]) || 0), 0).toFixed(2),
    [amounts, services],
  );
  const options = SUPPORTED_SUBSCRIPTION_INTERVAL_MONTHS.filter((months) => months !== currentIntervalMonths);

  return (
    <form id="term-retarget" action={action} className="mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <h3 className="text-sm font-semibold">Change term and pay by card</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        Starts a new {cadenceLabel(targetMonths).toLowerCase()} agreement, moves the live services onto it, and sends a Stripe Checkout link that charges {money(cycleTotal, currency)} today. The current {cadenceLabel(currentIntervalMonths).toLowerCase()} agreement is closed. Historical invoices stay on it.
      </p>

      <label className="mt-4 block text-sm font-medium">
        New term
        <select
          name="targetIntervalMonths"
          value={targetIntervalMonths}
          onChange={(event) => chooseInterval(event.target.value)}
          className={inputClass}
        >
          {options.map((months) => (
            <option key={months} value={months}>{cadenceLabel(months)}</option>
          ))}
        </select>
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Price per service for the new term</legend>
        <ul className="mt-2 space-y-3">
          {services.map((service) => (
            <li key={service.id} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
              <label className="block text-sm font-medium">
                {service.label}
                <span className="mt-0.5 block text-xs font-normal text-zinc-500">
                  Currently {money(service.currentAmount, currency)} per {cycleUnitLabel(service.currentIntervalMonths)}
                </span>
                <input
                  name={`serviceAmount:${service.id}`}
                  inputMode="decimal"
                  value={amounts[service.id] ?? ""}
                  onChange={(event) => setAmounts((current) => ({ ...current, [service.id]: event.target.value }))}
                  className={inputClass}
                />
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm font-semibold tabular-nums">New cycle total {money(cycleTotal, currency)} per {cycleUnitLabel(targetMonths)}</p>
      </fieldset>

      {openInvoices.length ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium">Overdue invoice on the current term</legend>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {openInvoices.map((invoice) => `${invoice.number ?? "Open invoice"} · ${money(invoice.amountDue, invoice.currency)}`).join("; ")}
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="invoiceDisposition" value="void" checked={disposition === "void"} onChange={() => setDisposition("void")} className="mt-1 size-4" />
            <span>Void it. They are not taking another {cadenceLabel(currentIntervalMonths).toLowerCase()} cycle.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="invoiceDisposition" value="leave" checked={disposition === "leave"} onChange={() => setDisposition("leave")} className="mt-1 size-4" />
            <span>Leave it collectable on the old agreement. They still owe that amount as well as the new card charge.</span>
          </label>
        </fieldset>
      ) : null}

      {leftoverSummary ? (
        <p className={`mt-3 rounded-lg p-3 text-sm ${requiresExplicitCancel ? "bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" : "bg-zinc-50 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"}`}>
          {leftoverSummary}
        </p>
      ) : null}
      {liveSubscriptions.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          {liveSubscriptions.map((entry) => (
            <li key={entry.id} className="break-all">{entry.id} · {entry.status}{entry.currentPeriodEnd ? ` · through ${entry.currentPeriodEnd}` : ""}</li>
          ))}
        </ul>
      ) : null}

      <fieldset className="mt-3 space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmChargeNow" value="yes" className="mt-1 size-4" />
          <span>Charge {money(cycleTotal, currency)} today when they complete Checkout, then every {cycleUnitLabel(targetMonths)}.</span>
        </label>
        {requiresExplicitCancel ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmCancelExisting" value="yes" className="mt-1 size-4" />
            <span>Cancel leftover live Stripe subscriptions and void open Stripe invoices so they are not billed twice. History stays in Stripe.</span>
          </label>
        ) : null}
      </fieldset>

      {state.error ? <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{state.error}</p> : null}
      {state.message ? <p role="status" className="mt-3 text-sm text-emerald-800 dark:text-emerald-300">{state.message}</p> : null}
      <button disabled={pending} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Starting new term…" : "Start new term and send Checkout"}
      </button>
    </form>
  );
}
