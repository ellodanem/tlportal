"use client";

import { useState, type ReactNode } from "react";

import { PaymentRemindersPreferenceForm } from "@/components/admin/payment-reminders-preference-form";
import { OutstandingInvoiceReminderPanel } from "@/components/admin/outstanding-invoice-reminder-panel";
import { customerReceivesPaymentReminders } from "@/lib/domain/payment-reminders";
import type { OutstandingInvoiceReminderCandidate } from "@/lib/billing/outstanding-invoice-reminder";
import type { CustomerBillingMode, PaymentRemindersPreference } from "@prisma/client";

function ReminderModal({
  open,
  title,
  titleId,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`flex max-h-[100dvh] w-full flex-col rounded-t-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 sm:max-h-[90vh] sm:rounded-xl ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            ← Back
          </button>
          <h2 id={titleId} className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <span className="w-12" aria-hidden />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function PaymentRemindersSection({
  customerId,
  customerName,
  greetingName,
  billingMode,
  paymentReminders,
  customerEmail,
  customerPhone,
  whatsAppConfigured,
  candidates,
}: {
  customerId: string;
  customerName: string;
  greetingName: string;
  billingMode: CustomerBillingMode;
  paymentReminders: PaymentRemindersPreference;
  customerEmail: string | null;
  customerPhone: string | null;
  whatsAppConfigured: boolean;
  candidates: OutstandingInvoiceReminderCandidate[];
}) {
  const [preferenceOpen, setPreferenceOpen] = useState(false);
  const [outstandingOpen, setOutstandingOpen] = useState(false);
  const effective = customerReceivesPaymentReminders({ billingMode, paymentReminders });

  const preferenceLabel =
    paymentReminders === "auto"
      ? "Auto (manual on, Stripe off)"
      : paymentReminders === "on"
        ? "On (always send)"
        : "Off (never send)";

  return (
    <>
      <section
        className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        aria-label="Payment reminders"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payment reminders</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Scheduled due/overdue nudges (WhatsApp today; same setting for all channels). Stripe card failures use the
          decline follow-up series instead. You can also send a one-off reminder for multiple outstanding invoices.
        </p>

        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Scheduled reminders
            </dt>
            <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
              {preferenceLabel} —{" "}
              <span className="font-medium">
                {effective ? "will receive reminders" : "will not receive reminders"}
              </span>
              {billingMode === "stripe_subscription" && paymentReminders === "auto" ? " (Stripe + Auto)" : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Outstanding invoices
            </dt>
            <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">
              {candidates.length === 0
                ? "None with payment links right now"
                : `${candidates.length} available to remind`}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreferenceOpen(true)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Reminder preference
          </button>
          <button
            type="button"
            onClick={() => setOutstandingOpen(true)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Outstanding invoices
            {candidates.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                {candidates.length}
              </span>
            ) : null}
          </button>
        </div>
      </section>

      <ReminderModal
        open={preferenceOpen}
        title="Reminder preference"
        titleId="payment-reminder-preference-title"
        onClose={() => setPreferenceOpen(false)}
      >
        <PaymentRemindersPreferenceForm
          customerId={customerId}
          billingMode={billingMode}
          paymentReminders={paymentReminders}
        />
      </ReminderModal>

      <ReminderModal
        open={outstandingOpen}
        title="Outstanding invoices"
        titleId="outstanding-invoices-reminder-title"
        onClose={() => setOutstandingOpen(false)}
        wide
      >
        <OutstandingInvoiceReminderPanel
          customerId={customerId}
          customerName={customerName}
          greetingName={greetingName}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          whatsAppConfigured={whatsAppConfigured}
          candidates={candidates}
          onSent={() => setOutstandingOpen(false)}
        />
      </ReminderModal>
    </>
  );
}
