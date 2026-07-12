"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  enableBillingSetupAction,
  setBillingModeAction,
  type BillingActionState,
} from "@/app/admin/customers/billing-actions";
import type { BillingSetupStatus } from "@/lib/services/billing-lifecycle-service";
import { SyncInvoilessButton } from "@/components/sync-invoiless-button";
import type { CustomerBillingMode } from "@prisma/client";

const initial: BillingActionState = { error: null };

/**
 * Billing settings only — Payment & plan lives in ManageSubscriptionTiles → PaymentPlanModal.
 */
export function CustomerBillingPanel({
  customerId,
  billingMode,
  invoilessConfigured,
  stripeConfigured,
  hasInvoilessId,
  billingSetup,
}: {
  customerId: string;
  billingMode: CustomerBillingMode;
  invoilessConfigured: boolean;
  stripeConfigured: boolean;
  hasInvoilessId: boolean;
  stripeCustomerId?: string | null;
  planOptions?: { durationMonths: number; label: string }[];
  defaultMonthlyRateXcd?: number;
  stripeMonthlyRateXcd?: number | null;
  defaultVehicleCount?: number;
  catalogConfigured?: boolean;
  billingSetup: BillingSetupStatus | null;
}) {
  const [modeState, modeAction, modePending] = useActionState(setBillingModeAction, initial);
  const [setupState, setupAction, setupPending] = useActionState(enableBillingSetupAction, initial);
  const isStripe = billingMode === "stripe_subscription";

  return (
    <div className="flex flex-col gap-4">
      <details
        id="billing-settings"
        className="group scroll-mt-24 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      >
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-zinc-900 marker:content-none dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            Billing settings
            <span className="text-xs font-normal text-zinc-500 group-open:hidden dark:text-zinc-400">
              — mode, provider links, Invoiless
            </span>
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-zinc-100 px-5 pb-5 pt-4 dark:border-zinc-800">
          {setupState.message && !setupState.error ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              {setupState.message}
            </p>
          ) : null}

          {billingSetup?.needsSetup ? (
            <form
              action={setupAction}
              className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/30"
            >
              <input type="hidden" name="customerId" value={customerId} />
              <input type="hidden" name="billingMode" value={billingMode} />
              <p className="text-sm text-amber-950 dark:text-amber-100">
                Provider accounts are not fully linked. This does not start Checkout.
              </p>
              <button
                type="submit"
                disabled={setupPending}
                className="w-fit rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
              >
                {setupPending ? "Linking…" : "Link billing accounts"}
              </button>
              {setupState.error ? <p className="text-sm text-red-600">{setupState.error}</p> : null}
            </form>
          ) : null}

          <form action={modeAction} className="flex flex-col gap-3">
            <input type="hidden" name="customerId" value={customerId} />
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Billing mode</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="billingMode"
                  value="manual_legacy"
                  defaultChecked={!isStripe}
                  className="text-emerald-600"
                />
                Manual / native invoices
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="billingMode"
                  value="stripe_subscription"
                  defaultChecked={isStripe}
                  disabled={!stripeConfigured}
                  className="text-emerald-600"
                />
                Stripe card subscription
                {!stripeConfigured ? (
                  <span className="text-xs text-zinc-500">(set STRIPE_SECRET_KEY)</span>
                ) : null}
              </label>
            </fieldset>
            <button
              type="submit"
              disabled={modePending}
              className="w-fit rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
            >
              {modePending ? "Saving…" : "Save billing mode"}
            </button>
            {modeState.error ? <p className="text-sm text-red-600">{modeState.error}</p> : null}
          </form>

          {invoilessConfigured ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                {hasInvoilessId
                  ? isStripe
                    ? "Paid Stripe invoices can mirror to Invoiless automatically. Manual invoices stay in Admin → Invoices."
                    : "Push updates billing address, legal info, notes, and invoice Cc/Bcc."
                  : "Sync creates the Invoiless contact for invoices and paid mirrors."}
              </p>
              <SyncInvoilessButton customerId={customerId} hasInvoilessId={hasInvoilessId} />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Native billing is primary — create invoices under{" "}
              <Link href="/admin/tl-invoices" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                Invoices
              </Link>
              .
            </p>
          )}

          {!stripeConfigured ? (
            <p className="text-sm text-zinc-500">Stripe is off until STRIPE_SECRET_KEY is set.</p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
