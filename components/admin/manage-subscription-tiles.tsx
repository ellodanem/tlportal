"use client";

import { useState, useTransition } from "react";

import { openStripePortalAction } from "@/app/admin/customers/billing-actions";
import { BillingSettingsModal } from "@/components/admin/billing-settings-modal";
import type { CustomerRenewalOpsRow } from "@/components/admin/customer-renewal-ops-panel";
import { DeviceRenewalsModal } from "@/components/admin/device-renewals-modal";
import { PaymentPlanModal } from "@/components/admin/payment-plan-modal";
import type { BillingSetupStatus } from "@/lib/services/billing-lifecycle-service";
import type { CustomerBillingMode } from "@prisma/client";

type PlanOption = { durationMonths: number; label: string };

/**
 * Manage subscription — two real intents:
 * - Payment & plan (modal)
 * - Device renewals (modal)
 * Secondary: billing portal + Billing settings (modal)
 */
export function ManageSubscriptionTiles({
  customerId,
  billingMode,
  invoilessConfigured,
  stripeConfigured,
  hasInvoilessId,
  billingSetup,
  planOptions,
  defaultMonthlyRateXcd,
  stripeMonthlyRateXcd,
  defaultVehicleCount,
  catalogConfigured,
  stripeCustomerId,
  renewalRows,
}: {
  customerId: string;
  billingMode: CustomerBillingMode;
  invoilessConfigured: boolean;
  stripeConfigured: boolean;
  hasInvoilessId: boolean;
  billingSetup: BillingSetupStatus | null;
  planOptions: PlanOption[];
  defaultMonthlyRateXcd: number;
  stripeMonthlyRateXcd: number | null;
  defaultVehicleCount: number;
  catalogConfigured: boolean;
  stripeCustomerId: string | null;
  renewalRows: CustomerRenewalOpsRow[];
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const [renewalsOpen, setRenewalsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [portalPending, startPortal] = useTransition();
  const [portalError, setPortalError] = useState<string | null>(null);

  function openPortal() {
    setPortalError(null);
    startPortal(async () => {
      const result = await openStripePortalAction(customerId);
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else if (result.error) {
        setPortalError(result.error);
      }
    });
  }

  return (
    <>
      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Manage subscription</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TileButton
            title="Payment & plan"
            subtitle="Tier, term, vehicles · send or create Checkout link"
            icon={<DocIcon />}
            onClick={() => setPlanOpen(true)}
          />
          <TileButton
            title="Device renewals"
            subtitle="Next due dates · mark paid · pause"
            icon={<CalendarIcon />}
            onClick={() => setRenewalsOpen(true)}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button
            type="button"
            disabled={portalPending || !stripeCustomerId}
            onClick={openPortal}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-emerald-700 disabled:opacity-50 dark:text-zinc-300 dark:hover:text-emerald-400"
          >
            <ExternalIcon className="h-4 w-4" />
            {portalPending ? "Opening portal…" : "Open customer billing portal"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-emerald-700 dark:text-zinc-300 dark:hover:text-emerald-400"
          >
            <GearIcon className="h-4 w-4" />
            Billing settings
          </button>
        </div>
        {portalError ? <p className="mt-2 text-sm text-red-600">{portalError}</p> : null}
      </section>

      <PaymentPlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        customerId={customerId}
        planOptions={planOptions}
        defaultMonthlyRateXcd={defaultMonthlyRateXcd}
        stripeMonthlyRateXcd={stripeMonthlyRateXcd}
        defaultVehicleCount={defaultVehicleCount}
        catalogConfigured={catalogConfigured}
      />

      <DeviceRenewalsModal
        open={renewalsOpen}
        onClose={() => setRenewalsOpen(false)}
        customerId={customerId}
        billingMode={billingMode}
        rows={renewalRows}
      />

      <BillingSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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

function TileButton({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</span>
      </span>
      <ChevronIcon className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-emerald-500 dark:text-zinc-600" />
    </button>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5" aria-hidden>
      <path d="M5.5 2.5h6l3 3v12h-9z" strokeLinejoin="round" />
      <path d="M11.5 2.5v3h3M7.5 9h5M7.5 12h5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5" aria-hidden>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8h14M7 3v3M13 3v3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path d="M8 5l4 5-4 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden>
      <path d="M11 4h5v5M16 4l-7 7M8 5H5a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden>
      <circle cx="10" cy="10" r="2.5" />
      <path
        d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
