"use client";

import { useState } from "react";

import { BillingSettingsModal } from "@/components/admin/billing-settings-modal";
import type { BillingSetupStatus } from "@/lib/services/billing-lifecycle-service";
import type { CustomerBillingMode } from "@prisma/client";

/**
 * Compact entry for Billing settings (manual customers, or anywhere tiles aren't shown).
 * Opens the same hard-dismiss modal as Manage subscription → Billing settings.
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Billing settings</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Mode, provider links, Invoiless
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Open
          </button>
        </div>
      </section>

      <BillingSettingsModal
        open={open}
        onClose={() => setOpen(false)}
        customerId={customerId}
        billingMode={billingMode}
        invoilessConfigured={invoilessConfigured}
        stripeConfigured={stripeConfigured}
        hasInvoilessId={hasInvoilessId}
        billingSetup={billingSetup}
      />
    </>
  );
}
