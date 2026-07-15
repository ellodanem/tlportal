"use client";

import { useState } from "react";

import type { CheckoutSendPreview } from "@/app/admin/customers/billing-actions";
import { CHECKOUT_LINK_VALID_HOURS } from "@/lib/stripe/checkout-messaging";

/** Render WhatsApp *bold* markers for staff preview. */
function WhatsAppPreviewBody({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <strong key={i} className="font-semibold text-zinc-900 dark:text-zinc-100">
              {part.slice(1, -1)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

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
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showWhatsAppPreview, setShowWhatsAppPreview] = useState(true);

  if (!open || !preview) return null;

  const canEmail = Boolean(preview.email);
  const canWhatsApp = preview.phoneValid && preview.whatsAppConfigured;
  const willEmail = sendEmail && canEmail;
  const willWhatsApp = sendWhatsApp && canWhatsApp;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-send-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2 id="checkout-send-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {pending ? "Sending payment link…" : "Send payment link to customer?"}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {pending
            ? "Creating a Stripe Checkout link and contacting the customer. Keep this window open."
            : (
              <>
                This creates a new Stripe Checkout link and sends it to <strong>{preview.customerName}</strong>.
              </>
            )}
        </p>

        {pending ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-900 dark:text-emerald-100">
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent dark:border-emerald-400 dark:border-t-transparent"
                aria-hidden
              />
              Working…
            </div>
            <ul className="mt-3 space-y-2 text-sm text-emerald-900 dark:text-emerald-100">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  1
                </span>
                <span>Create Stripe Checkout link</span>
              </li>
              {willEmail ? (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    2
                  </span>
                  <span>
                    Send email to <span className="font-medium">{preview.email}</span>
                  </span>
                </li>
              ) : null}
              {willWhatsApp ? (
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    {willEmail ? "3" : "2"}
                  </span>
                  <span>
                    Send WhatsApp to <span className="font-medium">{preview.phone}</span>
                  </span>
                </li>
              ) : null}
            </ul>
            <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">
              Success means SMTP / Twilio accepted the message — not proof of inbox delivery. Results appear below
              and in Customer → Messages / activity.
            </p>
          </div>
        ) : (
          <>
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

            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Message preview
              </p>
              {willEmail ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/60">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    onClick={() => setShowEmailPreview((v) => !v)}
                  >
                    Email preview
                    <span className="text-xs text-zinc-500">{showEmailPreview ? "Hide" : "Show"}</span>
                  </button>
                  {showEmailPreview ? (
                    <div
                      className="max-h-40 overflow-auto border-t border-zinc-200 px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:text-zinc-300 [&_a]:text-emerald-700 [&_a]:underline dark:[&_a]:text-emerald-400 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-zinc-900 dark:[&_strong]:text-zinc-100"
                      dangerouslySetInnerHTML={{ __html: preview.emailPreviewHtml }}
                    />
                  ) : null}
                </div>
              ) : null}
              {willWhatsApp ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/60">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-zinc-800 dark:text-zinc-200"
                    onClick={() => setShowWhatsAppPreview((v) => !v)}
                  >
                    WhatsApp preview
                    <span className="text-xs text-zinc-500">{showWhatsAppPreview ? "Hide" : "Show"}</span>
                  </button>
                  {showWhatsAppPreview ? (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-zinc-200 px-3 py-2 font-sans text-xs leading-relaxed text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                      <WhatsAppPreviewBody text={preview.whatsAppPreviewText} />
                    </pre>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                The real payment URL is inserted when you send. WhatsApp wording must match your Twilio templates
                (auto-charge line uses {"{{5}}"} for the billing term).
              </p>
            </div>
          </>
        )}

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
            disabled={
              pending ||
              (!sendEmail && !sendWhatsApp) ||
              (sendEmail && !canEmail) ||
              (sendWhatsApp && !canWhatsApp)
            }
            onClick={() =>
              onConfirm({
                sendEmail: willEmail,
                sendWhatsApp: willWhatsApp,
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
