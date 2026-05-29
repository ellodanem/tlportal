"use client";

import { useState } from "react";

import type { CheckoutSendPreview } from "@/app/admin/customers/billing-actions";
import { CHECKOUT_LINK_VALID_HOURS } from "@/lib/stripe/checkout-messaging";

export function CheckoutSendConfirmDialog({
  open,
  preview,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  preview: CheckoutSendPreview | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (opts: { sendEmail: boolean; sendWhatsApp: boolean; forceResend: boolean }) => void;
}) {
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(true);

  if (!open || !preview) return null;

  const canEmail = Boolean(preview.email);
  const canWhatsApp = preview.phoneValid && preview.whatsAppConfigured;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-send-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2 id="checkout-send-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Send payment link to customer?
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This creates a new Stripe Checkout link and sends it to <strong>{preview.customerName}</strong>.
        </p>

        {preview.hasRecentLink ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            A payment link was already sent within the last {CHECKOUT_LINK_VALID_HOURS} hours
            {preview.recentSentAt
              ? ` (${new Date(preview.recentSentAt).toLocaleString()})`
              : ""}
            . Sending again will create a <strong>new</strong> link.
          </p>
        ) : null}

        <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendEmail && canEmail}
                disabled={!canEmail || pending}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Email {preview.email ? `(${preview.email})` : "— none on file"}
            </label>
          </li>
          <li>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendWhatsApp && canWhatsApp}
                disabled={!canWhatsApp || pending}
                onChange={(e) => setSendWhatsApp(e.target.checked)}
              />
              WhatsApp{" "}
              {preview.phone
                ? preview.phoneValid
                  ? `(${preview.phone})`
                  : `(${preview.phone} — invalid format)`
                : "— no phone"}
              {!preview.whatsAppConfigured ? " — Twilio not configured" : null}
            </label>
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || (!sendEmail && !sendWhatsApp) || (sendEmail && !canEmail) || (sendWhatsApp && !canWhatsApp)}
            onClick={() =>
              onConfirm({
                sendEmail: sendEmail && canEmail,
                sendWhatsApp: sendWhatsApp && canWhatsApp,
                forceResend: preview.hasRecentLink,
              })
            }
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
          >
            {pending ? "Sending…" : "Send to customer"}
          </button>
        </div>
      </div>
    </div>
  );
}
