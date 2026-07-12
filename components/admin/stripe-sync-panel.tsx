"use client";

import { useActionState, useState } from "react";

import {
  pushStripeSubscriptionQuantityAction,
  type BillingActionState,
} from "@/app/admin/customers/billing-actions";
import type { StripeSubscriptionSyncView } from "@/lib/services/stripe-subscription-sync-service";

const initial: BillingActionState = { error: null };

/**
 * Live TL vs Stripe quantity drift + Review → push (proration none).
 * Only renders when compare state is "differs".
 */
export function StripeSyncPanel({
  customerId,
  sync,
}: {
  customerId: string;
  sync: StripeSubscriptionSyncView;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pushState, pushAction, pushPending] = useActionState(
    pushStripeSubscriptionQuantityAction,
    initial,
  );

  if (sync.state !== "differs" || sync.stripeQuantity == null) {
    return null;
  }

  const tl = sync.tlVehicleCount;
  const stripe = sync.stripeQuantity;
  const nextInvoiceLabel = sync.periodEndLabel ?? "next cycle";

  return (
    <section
      className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/30"
      aria-label="Stripe sync differences"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
        <WarningIcon className="h-4 w-4" />
        TL and Stripe differ
      </p>
      {sync.reason ? (
        <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">{sync.reason}</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <DiffField label="Vehicles">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-zinc-500">TL</span>
              <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                {tl}
              </span>
              <ArrowIcon className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-zinc-500">Stripe</span>
              <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                {stripe}
              </span>
            </span>
          </DiffField>
          <DiffField label="Next invoice">
            <span className="text-zinc-700 dark:text-zinc-200">{nextInvoiceLabel}</span>
          </DiffField>
          {sync.tlNextChargeLabel && sync.stripeNextChargeLabel ? (
            <DiffField label="Next charge">
              <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200">
                <span>{sync.stripeNextChargeLabel}</span>
                <ArrowIcon className="h-3.5 w-3.5 text-zinc-400" />
                <span className="font-medium">{sync.tlNextChargeLabel}</span>
              </span>
            </DiffField>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!sync.canPush || pushPending}
            onClick={() => setReviewOpen(true)}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
          >
            Review &amp; update Stripe
          </button>
        </div>
      </div>

      {pushState.error ? <p className="mt-3 text-sm text-red-600">{pushState.error}</p> : null}
      {pushState.message && !pushState.error ? (
        <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-200">{pushState.message}</p>
      ) : null}

      {reviewOpen ? (
        <ReviewChangeModal
          customerId={customerId}
          tlVehicles={tl}
          stripeVehicles={stripe}
          tlCharge={sync.tlNextChargeLabel}
          stripeCharge={sync.stripeNextChargeLabel}
          nextInvoiceLabel={nextInvoiceLabel}
          pending={pushPending}
          formAction={pushAction}
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
  customerId,
  tlVehicles,
  stripeVehicles,
  tlCharge,
  stripeCharge,
  nextInvoiceLabel,
  pending,
  formAction,
  onClose,
}: {
  customerId: string;
  tlVehicles: number;
  stripeVehicles: number;
  tlCharge: string | null;
  stripeCharge: string | null;
  nextInvoiceLabel: string;
  pending: boolean;
  formAction: (payload: FormData) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Review Stripe quantity update"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Review change</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800"
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
          {stripeCharge && tlCharge ? (
            <ReviewRow label="Next charge">
              <span className="inline-flex items-center gap-2">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium dark:bg-zinc-800">{stripeCharge}</span>
                <ArrowIcon className="h-3.5 w-3.5 text-zinc-400" />
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                  {tlCharge}
                </span>
              </span>
            </ReviewRow>
          ) : null}
          <ReviewRow label="When">
            <span className="text-zinc-700 dark:text-zinc-200">
              Next invoice ({nextInvoiceLabel}) — no charge today
            </span>
          </ReviewRow>
          <ReviewRow label="Proration">
            <span className="text-zinc-700 dark:text-zinc-200">None</span>
          </ReviewRow>
        </dl>

        <form action={formAction} className="mt-5 flex justify-end gap-2">
          <input type="hidden" name="customerId" value={customerId} />
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
          >
            {pending ? "Updating…" : "Update Stripe"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
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
