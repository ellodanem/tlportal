"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  getStripeCheckoutSendPreview,
  sendStripeCheckoutToCustomerAction,
  setStripeMonthlyRateAction,
  startStripeCheckoutAction,
  type BillingActionState,
  type CheckoutSendPreview,
} from "@/app/admin/customers/billing-actions";
import { CheckoutSendConfirmDialog } from "@/components/admin/checkout-send-confirm-dialog";
import { checkoutInitialLinkNotice } from "@/lib/stripe/checkout-messaging";
import { formatPlanTerm, formatXcd } from "@/lib/subscription-options/display";


const initial: BillingActionState = { error: null };

type PlanOption = { durationMonths: number; label: string };

function ratePresetFromSaved(
  stripeMonthlyRateXcd: number | null,
  defaultMonthlyRateXcd: number,
): { preset: string; custom: string } {
  if (stripeMonthlyRateXcd == null) {
    return { preset: "default", custom: "" };
  }
  if (String(stripeMonthlyRateXcd) === String(defaultMonthlyRateXcd)) {
    return { preset: "default", custom: "" };
  }
  if ([20, 25, 30].includes(stripeMonthlyRateXcd)) {
    return { preset: String(stripeMonthlyRateXcd), custom: "" };
  }
  return { preset: "custom", custom: String(stripeMonthlyRateXcd) };
}

function resolveInitialPlanTerm(
  planOptions: PlanOption[],
  savedPlanTermMonths: number | null,
): number {
  if (
    savedPlanTermMonths != null &&
    planOptions.some((p) => p.durationMonths === savedPlanTermMonths)
  ) {
    return savedPlanTermMonths;
  }
  return planOptions[0]?.durationMonths ?? 1;
}

/**
 * Hard-dismiss modal: only Back / Done close it (no backdrop click, no Esc).
 * One surface for tier, term, vehicles + Send / Create link / Save pricing.
 */
export function PaymentPlanModal({
  open,
  onClose,
  customerId,
  planOptions,
  defaultMonthlyRateXcd,
  stripeMonthlyRateXcd,
  savedPlanTermMonths,
  defaultVehicleCount,
  catalogConfigured,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  planOptions: PlanOption[];
  defaultMonthlyRateXcd: number;
  stripeMonthlyRateXcd: number | null;
  savedPlanTermMonths: number | null;
  defaultVehicleCount: number;
  catalogConfigured: boolean;
}) {
  if (!open) return null;

  return (
    <PaymentPlanModalBody
      key={`${customerId}-${stripeMonthlyRateXcd ?? "default"}-${savedPlanTermMonths ?? "none"}-${defaultVehicleCount}`}
      onClose={onClose}
      customerId={customerId}
      planOptions={planOptions}
      defaultMonthlyRateXcd={defaultMonthlyRateXcd}
      stripeMonthlyRateXcd={stripeMonthlyRateXcd}
      savedPlanTermMonths={savedPlanTermMonths}
      defaultVehicleCount={defaultVehicleCount}
      catalogConfigured={catalogConfigured}
    />
  );
}

function PaymentPlanModalBody({
  onClose,
  customerId,
  planOptions,
  defaultMonthlyRateXcd,
  stripeMonthlyRateXcd,
  savedPlanTermMonths,
  defaultVehicleCount,
  catalogConfigured,
}: {
  onClose: () => void;
  customerId: string;
  planOptions: PlanOption[];
  defaultMonthlyRateXcd: number;
  stripeMonthlyRateXcd: number | null;
  savedPlanTermMonths: number | null;
  defaultVehicleCount: number;
  catalogConfigured: boolean;
}) {
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(startStripeCheckoutAction, initial);
  const [sendState, sendFormAction, sendPending] = useActionState(sendStripeCheckoutToCustomerAction, initial);
  const [pricingState, pricingAction, pricingPending] = useActionState(setStripeMonthlyRateAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendPreview, setSendPreview] = useState<CheckoutSendPreview | null>(null);
  const [previewPending, startPreview] = useTransition();
  const sendWasPendingRef = useRef(false);
  const paymentUrl = checkoutState.url ?? sendState.url;
  const paymentMessage = checkoutState.message ?? sendState.message;
  const paymentEmailSent = checkoutState.emailSent ?? sendState.emailSent;
  const paymentWhatsAppSent = sendState.whatsappSent;
  const saved = ratePresetFromSaved(stripeMonthlyRateXcd, defaultMonthlyRateXcd);
  const initialPlanTerm = resolveInitialPlanTerm(planOptions, savedPlanTermMonths);
  const savedRateLabel = formatXcd(stripeMonthlyRateXcd ?? defaultMonthlyRateXcd);
  const hasSavedPricing = savedPlanTermMonths != null || stripeMonthlyRateXcd != null;
  const [ratePreset, setRatePreset] = useState(saved.preset);
  const [customRate, setCustomRate] = useState(saved.custom);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const checkoutError = checkoutState.error ?? sendState.error;
  const busy = checkoutPending || sendPending || pricingPending || previewPending;
  const closeLabel = paymentUrl ? "Done" : "Back to billing";

  useEffect(() => {
    if (sendPending) {
      sendWasPendingRef.current = true;
      return;
    }
    if (sendWasPendingRef.current && sendDialogOpen) {
      sendWasPendingRef.current = false;
      setSendDialogOpen(false);
    }
  }, [sendPending, sendDialogOpen]);

  function openSendDialog() {
    const form = formRef.current;
    if (!form) return;
    setPreviewError(null);
    startPreview(async () => {
      const result = await getStripeCheckoutSendPreview(new FormData(form));
      if ("error" in result) {
        setPreviewError(result.error);
        setSendPreview(null);
        setSendDialogOpen(false);
        return;
      }
      setSendPreview(result);
      setSendDialogOpen(true);
    });
  }

  function submitSendToCustomer(opts: {
    sendEmail: boolean;
    sendWhatsApp: boolean;
    forceResend: boolean;
  }) {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    if (opts.sendEmail) fd.set("sendEmail", "on");
    if (opts.sendWhatsApp) fd.set("sendWhatsApp", "on");
    if (opts.forceResend) fd.set("forceResend", "on");
    sendFormAction(fd);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-plan-title"
    >
      <div className="flex max-h-[100dvh] w-full max-w-lg flex-col rounded-t-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 sm:max-h-[90vh] sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={onClose}
            disabled={sendPending}
            className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-60 dark:text-emerald-400"
          >
            ← {closeLabel}
          </button>
          <h2 id="payment-plan-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Payment &amp; plan
          </h2>
          <span className="w-16" aria-hidden />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Set tier, term, and vehicles — then send a Checkout link, create a link only, or save pricing without
            sending.
          </p>
          {hasSavedPricing ? (
            <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <span className="font-medium">Currently saved: </span>
              {savedPlanTermMonths != null ? formatPlanTerm(savedPlanTermMonths) : "term unset"}
              {" · "}
              {savedRateLabel}/mo per vehicle
              {" · "}
              {defaultVehicleCount} vehicle{defaultVehicleCount === 1 ? "" : "s"}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {ratePreset === "custom"
              ? "Custom tiers use dynamic per-vehicle pricing."
              : catalogConfigured
                ? "Catalog tiers use Stripe Price × vehicle count."
                : "No catalog Price for this tier/term — dynamic pricing. Add Price ids under Subscription options."}{" "}
            {checkoutInitialLinkNotice()}
          </p>

          {planOptions.length > 0 ? (
            <form ref={formRef} action={checkoutAction} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="customerId" value={customerId} />
              <input
                type="hidden"
                name="monthlyRateXcd"
                value={ratePreset === "custom" ? "custom" : ratePreset}
              />
              {ratePreset === "custom" ? (
                <input type="hidden" name="customMonthlyRateXcd" value={customRate} />
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Monthly tier</span>
                  <select
                    className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    value={ratePreset}
                    onChange={(e) => setRatePreset(e.target.value)}
                  >
                    <option value="default">Default ({formatXcd(defaultMonthlyRateXcd)}/mo)</option>
                    <option value="25">$25 / month</option>
                    <option value="20">$20 / month</option>
                    <option value="custom">Custom…</option>
                  </select>
                </label>
                {ratePreset === "custom" ? (
                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">Custom rate (XCD/mo)</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={customRate}
                      onChange={(e) => setCustomRate(e.target.value)}
                      placeholder="Per vehicle / month"
                      className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </label>
                ) : null}
                <label className="block text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Plan term</span>
                  <select
                    name="durationMonths"
                    className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    defaultValue={String(initialPlanTerm)}
                  >
                    {planOptions.map((p) => (
                      <option key={p.durationMonths} value={p.durationMonths}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Vehicles</span>
                  <input
                    type="number"
                    name="vehicleCount"
                    min={1}
                    max={9999}
                    defaultValue={String(defaultVehicleCount)}
                    className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Stripe quantity ({defaultVehicleCount} active assignment
                    {defaultVehicleCount === 1 ? "" : "s"})
                  </span>
                </label>
              </div>

              <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openSendDialog}
                  className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
                >
                  {sendPending || previewPending ? "Working…" : "Send to customer"}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
                >
                  {checkoutPending ? "Creating…" : "Create link only"}
                </button>
                <button
                  type="submit"
                  formAction={pricingAction}
                  disabled={busy}
                  className="w-full text-center text-sm font-medium text-zinc-600 underline-offset-2 hover:underline disabled:opacity-60 dark:text-zinc-400"
                >
                  {pricingPending ? "Saving…" : "Save pricing without sending"}
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
              No subscription plans found. Run migrations/seed or check subscription options.
            </p>
          )}

          {previewError ? <p className="mt-3 text-sm text-red-600">{previewError}</p> : null}
          {checkoutError ? <p className="mt-3 text-sm text-red-600">{checkoutError}</p> : null}
          {pricingState.error ? <p className="mt-3 text-sm text-red-600">{pricingState.error}</p> : null}
          {pricingState.message && !pricingState.error ? (
            <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-200">{pricingState.message}</p>
          ) : null}
          {paymentUrl ? (
            <CheckoutPaymentLink
              url={paymentUrl}
              message={paymentMessage}
              emailAttempted={sendState.emailAttempted}
              whatsappAttempted={sendState.whatsappAttempted}
              emailSent={paymentEmailSent}
              whatsappSent={paymentWhatsAppSent}
              emailError={sendState.emailError}
              whatsappError={sendState.whatsappError}
              emailTo={sendState.emailTo}
              whatsappTo={sendState.whatsappTo}
            />
          ) : null}
        </div>

        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={sendPending}
            className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
          >
            {closeLabel}
          </button>
        </div>
      </div>

      <CheckoutSendConfirmDialog
        open={sendDialogOpen}
        preview={sendPreview}
        pending={sendPending}
        onCancel={() => setSendDialogOpen(false)}
        onConfirm={submitSendToCustomer}
      />
    </div>
  );
}

function ChannelStatusRow({
  label,
  attempted,
  sent,
  error,
  to,
  successDetail,
}: {
  label: string;
  attempted?: boolean;
  sent?: boolean;
  error?: string | null;
  to?: string | null;
  successDetail: string;
}) {
  if (!attempted && !sent && !error) return null;

  const tone =
    sent === true
      ? "text-emerald-800 dark:text-emerald-200"
      : error
        ? "text-amber-900 dark:text-amber-100"
        : "text-zinc-600 dark:text-zinc-400";
  const badge =
    sent === true
      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100"
      : error
        ? "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  const status = sent === true ? "Accepted" : error ? "Failed" : "Not sent";

  return (
    <div className={`mt-2 rounded-md border border-emerald-200/80 bg-white/70 px-2.5 py-2 dark:border-emerald-900/60 dark:bg-zinc-950/40 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${badge}`}>{status}</span>
      </div>
      {to ? <p className="mt-0.5 text-xs opacity-90">To: {to}</p> : null}
      {sent ? <p className="mt-0.5 text-xs opacity-90">{successDetail}</p> : null}
      {error ? <p className="mt-0.5 text-xs opacity-90">{error}</p> : null}
    </div>
  );
}

function CheckoutPaymentLink({
  url,
  message,
  emailAttempted,
  whatsappAttempted,
  emailSent,
  whatsappSent,
  emailError,
  whatsappError,
  emailTo,
  whatsappTo,
}: {
  url: string;
  message?: string;
  emailAttempted?: boolean;
  whatsappAttempted?: boolean;
  emailSent?: boolean;
  whatsappSent?: boolean;
  emailError?: string | null;
  whatsappError?: string | null;
  emailTo?: string | null;
  whatsappTo?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const showSendResults =
    emailAttempted || whatsappAttempted || emailSent || whatsappSent || emailError || whatsappError;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this payment link:", url);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Payment link ready</p>
      {message ? <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">{message}</p> : null}

      {showSendResults ? (
        <div className="mt-2">
          <ChannelStatusRow
            label="Email"
            attempted={emailAttempted}
            sent={emailSent}
            error={emailError}
            to={emailTo}
            successDetail="Accepted by your SMTP settings (not an inbox delivery receipt)."
          />
          <ChannelStatusRow
            label="WhatsApp"
            attempted={whatsappAttempted}
            sent={whatsappSent}
            error={whatsappError}
            to={whatsappTo}
            successDetail="Accepted by Twilio and logged under Customer → Messages."
          />
          <p className="mt-2 text-xs text-emerald-800/90 dark:text-emerald-200/90">
            Sends are also recorded in customer activity (Communications).
          </p>
        </div>
      ) : null}

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          readOnly
          value={url}
          className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs text-zinc-800 dark:border-emerald-800 dark:bg-zinc-950 dark:text-zinc-200"
          onFocus={(e) => e.target.select()}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Open Checkout
          </a>
        </div>
      </div>
    </div>
  );
}
