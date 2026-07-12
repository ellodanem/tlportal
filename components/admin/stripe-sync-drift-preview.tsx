"use client";

import { useState } from "react";

/**
 * Design preview of the "TL and Stripe differ" reconciliation card + Review
 * modal. The real comparison and push-to-Stripe logic ships in a follow-up;
 * this renders illustrative sample values so staff can preview the flow. All
 * write actions are disabled placeholders.
 */
export function StripeSyncDriftPreview({
  vehicleCount,
  monthlyRateLabel,
  periodEndLabel,
}: {
  vehicleCount: number;
  monthlyRateLabel: string;
  periodEndLabel: string | null;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);

  const stripeVehicles = Math.max(2, vehicleCount);
  const tlVehicles = Math.max(1, stripeVehicles - 1);
  const currencyPrefix = (monthlyRateLabel.match(/^[^\d]*/)?.[0] ?? "").trim();
  const rate = Number(monthlyRateLabel.replace(/[^\d.]/g, "")) || 25;
  const money = (n: number) => `${currencyPrefix}${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const nextInvoiceLabel = periodEndLabel ?? "next cycle";

  return (
    <section
      className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/30"
      aria-label="Stripe sync differences (preview)"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
          <WarningIcon className="h-4 w-4" />
          TL and Stripe differ
        </p>
        <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          Design preview — sync ships next
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <DiffField label="Vehicles">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-zinc-500">TL</span>
              <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                {tlVehicles}
              </span>
              <ArrowIcon className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-zinc-500">Stripe</span>
              <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                {stripeVehicles}
              </span>
            </span>
          </DiffField>
          <DiffField label="Next invoice">
            <span className="text-zinc-700 dark:text-zinc-200">
              {nextInvoiceLabel} <span className="text-emerald-700 dark:text-emerald-300">(match)</span>
            </span>
          </DiffField>
          <DiffField label="Rate">
            <span className="text-zinc-700 dark:text-zinc-200">
              {money(rate)} <span className="text-emerald-700 dark:text-emerald-300">(match)</span>
            </span>
          </DiffField>
        </dl>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            title="Push ships next — this is a design preview."
            className="cursor-not-allowed rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white opacity-70 dark:bg-emerald-600"
          >
            Update Stripe to match TL
          </button>
          <button
            type="button"
            disabled
            title="Push ships next — this is a design preview."
            className="cursor-not-allowed rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 opacity-80 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Keep Stripe, update TL
          </button>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Review
          </button>
        </div>
      </div>

      {reviewOpen ? (
        <ReviewChangeModal
          tlVehicles={tlVehicles}
          stripeVehicles={stripeVehicles}
          stripeCharge={money(rate * stripeVehicles)}
          tlCharge={money(rate * tlVehicles)}
          nextInvoiceLabel={nextInvoiceLabel}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
    </section>
  );
}

function DiffField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function ReviewChangeModal({
  tlVehicles,
  stripeVehicles,
  stripeCharge,
  tlCharge,
  nextInvoiceLabel,
  onClose,
}: {
  tlVehicles: number;
  stripeVehicles: number;
  stripeCharge: string;
  tlCharge: string;
  nextInvoiceLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Review change (preview)"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Review change</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          <ReviewRow label="Vehicles">
            <span className="inline-flex items-center gap-2">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium dark:bg-zinc-800">{stripeVehicles}</span>
              <ArrowIcon className="h-3.5 w-3.5 text-zinc-400" />
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                {tlVehicles}
              </span>
            </span>
          </ReviewRow>
          <ReviewRow label="Next charge">
            <span className="inline-flex items-center gap-2">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium dark:bg-zinc-800">{stripeCharge}</span>
              <ArrowIcon className="h-3.5 w-3.5 text-zinc-400" />
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                {tlCharge}
              </span>
            </span>
          </ReviewRow>
          <ReviewRow label="When">
            <span className="text-zinc-700 dark:text-zinc-200">
              Next invoice ({nextInvoiceLabel}) — no charge today
            </span>
          </ReviewRow>
          <ReviewRow label="Proration">
            <span className="text-zinc-700 dark:text-zinc-200">None</span>
          </ReviewRow>
        </dl>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled
            title="Push ships next — this is a design preview."
            className="cursor-not-allowed rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white opacity-70 dark:bg-emerald-600"
          >
            Update Stripe
          </button>
        </div>
        <p className="mt-2 text-right text-[11px] text-zinc-400">Preview only — no changes are sent to Stripe.</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.485 3.5c.67-1.16 2.36-1.16 3.03 0l6.28 10.88c.67 1.16-.17 2.62-1.52 2.62H3.72c-1.35 0-2.19-1.46-1.51-2.62L8.485 3.5zM10 7a1 1 0 00-1 1v3a1 1 0 002 0V8a1 1 0 00-1-1zm0 7.5a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path d="M4 10h11M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
    </svg>
  );
}
