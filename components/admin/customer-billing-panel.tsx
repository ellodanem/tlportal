"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  enableBillingSetupAction,
  getStripeCheckoutSendPreview,
  openStripePortalAction,
  sendStripeCheckoutToCustomerAction,
  setBillingModeAction,
  setStripeMonthlyRateAction,
  startStripeCheckoutAction,
  type BillingActionState,
  type CheckoutSendPreview,
} from "@/app/admin/customers/billing-actions";
import { CheckoutSendConfirmDialog } from "@/components/admin/checkout-send-confirm-dialog";
import type { BillingSetupStatus } from "@/lib/services/billing-lifecycle-service";
import { checkoutInitialLinkNotice } from "@/lib/stripe/checkout-messaging";
import { formatXcd } from "@/lib/subscription-options/display";
import { SyncInvoilessButton } from "@/components/sync-invoiless-button";
import type { CustomerBillingMode } from "@prisma/client";

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

export function CustomerBillingPanel({
  customerId,
  billingMode,
  invoilessConfigured,
  stripeConfigured,
  hasInvoilessId,
  stripeCustomerId,
  planOptions,
  defaultMonthlyRateXcd,
  stripeMonthlyRateXcd,
  defaultVehicleCount,
  catalogConfigured,
  billingSetup,
}: {
  customerId: string;
  billingMode: CustomerBillingMode;
  invoilessConfigured: boolean;
  stripeConfigured: boolean;
  hasInvoilessId: boolean;
  stripeCustomerId: string | null;
  planOptions: PlanOption[];
  defaultMonthlyRateXcd: number;
  stripeMonthlyRateXcd: number | null;
  defaultVehicleCount: number;
  catalogConfigured: boolean;
  billingSetup: BillingSetupStatus | null;
}) {
  const [modeState, modeAction, modePending] = useActionState(setBillingModeAction, initial);
  const [setupState, setupAction, setupPending] = useActionState(enableBillingSetupAction, initial);
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(startStripeCheckoutAction, initial);
  const [sendState, sendFormAction, sendPending] = useActionState(sendStripeCheckoutToCustomerAction, initial);
  const [pricingState, pricingAction, pricingPending] = useActionState(setStripeMonthlyRateAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendPreview, setSendPreview] = useState<CheckoutSendPreview | null>(null);
  const [previewPending, startPreview] = useTransition();
  const paymentUrl = checkoutState.url ?? sendState.url;
  const paymentMessage = checkoutState.message ?? sendState.message;
  const paymentEmailSent = checkoutState.emailSent ?? sendState.emailSent;
  const paymentWhatsAppSent = sendState.whatsappSent;
  const saved = ratePresetFromSaved(stripeMonthlyRateXcd, defaultMonthlyRateXcd);
  const [ratePreset, setRatePreset] = useState(saved.preset);
  const [customRate, setCustomRate] = useState(saved.custom);
  const [portalPending, startPortal] = useTransition();
  const [portalError, setPortalError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  const isStripe = billingMode === "stripe_subscription";
  const checkoutError = checkoutState.error ?? sendState.error;
  const busy = checkoutPending || sendPending || pricingPending || previewPending;

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
    setSendDialogOpen(false);
    sendFormAction(fd);
  }

  return (
    <div className="flex flex-col gap-4">
      {isStripe && stripeConfigured ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payment link</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Choose tier, term, and vehicles — then create or email a Checkout link. Pricing saves automatically when you
            send a link, or use <strong className="font-medium">Save pricing</strong> without sending.
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {ratePreset === "custom"
              ? "Custom tiers use dynamic per-vehicle pricing."
              : catalogConfigured
                ? "Catalog tiers use Stripe Price × vehicle count."
                : "No catalog Price for this tier/term — dynamic pricing. Add Price ids under Subscription options."}{" "}
            {checkoutInitialLinkNotice()} Recovery email after expiry when SMTP and webhooks are configured.
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

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block text-sm">
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
                  <label className="block text-sm">
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
                    defaultValue={String(planOptions[0]?.durationMonths ?? 1)}
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

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={busy}
                  onClick={openSendDialog}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
                >
                  {sendPending ? "Sending…" : "Send to customer"}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
                >
                  {checkoutPending ? "Creating…" : "Create link only"}
                </button>
                <button
                  type="submit"
                  formAction={pricingAction}
                  disabled={busy}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
                >
                  {pricingPending ? "Saving…" : "Save pricing"}
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              No subscription plans found. Run migrations/seed or check subscription options.
            </p>
          )}

          {previewError ? <p className="mt-2 text-sm text-red-600">{previewError}</p> : null}
          {checkoutError ? <p className="mt-2 text-sm text-red-600">{checkoutError}</p> : null}
          {pricingState.error ? <p className="mt-2 text-sm text-red-600">{pricingState.error}</p> : null}
          {pricingState.message && !pricingState.error ? (
            <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">{pricingState.message}</p>
          ) : null}
          {paymentUrl ? (
            <CheckoutPaymentLink
              url={paymentUrl}
              message={paymentMessage}
              emailSent={paymentEmailSent}
              whatsappSent={paymentWhatsAppSent}
            />
          ) : null}

          <CheckoutSendConfirmDialog
            open={sendDialogOpen}
            preview={sendPreview}
            pending={sendPending}
            onCancel={() => setSendDialogOpen(false)}
            onConfirm={submitSendToCustomer}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={portalPending || !stripeCustomerId}
              onClick={openPortal}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
            >
              {portalPending ? "Opening…" : "Customer billing portal"}
            </button>
          </div>
          {portalError ? <p className="mt-1 text-sm text-red-600">{portalError}</p> : null}
        </section>
      ) : null}

      <details id="billing-settings" className="group scroll-mt-24 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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
            <form action={setupAction} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/30">
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

function CheckoutPaymentLink({
  url,
  message,
  emailSent,
  whatsappSent,
}: {
  url: string;
  message?: string;
  emailSent?: boolean;
  whatsappSent?: boolean;
}) {
  const [copied, setCopied] = useState(false);

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
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Payment link ready</p>
      {message ? <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">{message}</p> : null}
      {emailSent ? (
        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">Email sent via your SMTP settings.</p>
      ) : null}
      {whatsappSent ? (
        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">WhatsApp sent via Twilio.</p>
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
