"use client";

import { useActionState, useState, useTransition } from "react";
import {
  emailStripeCheckoutLinkAction,
  enableBillingSetupAction,
  openStripePortalAction,
  setBillingModeAction,
  setStripeMonthlyRateAction,
  startStripeCheckoutAction,
  type BillingActionState,
} from "@/app/admin/customers/billing-actions";
import type { BillingSetupStatus } from "@/lib/services/billing-lifecycle-service";
import { checkoutInitialLinkNotice } from "@/lib/stripe/checkout-messaging";
import { formatXcd } from "@/lib/subscription-options/display";
import { SyncInvoilessButton } from "@/components/sync-invoiless-button";
import type { CustomerBillingMode } from "@prisma/client";

const initial: BillingActionState = { error: null };

type PlanOption = { durationMonths: number; label: string };

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
  stripeBanner,
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
  stripeBanner?: "success" | "cancel" | null;
}) {
  const [modeState, modeAction, modePending] = useActionState(setBillingModeAction, initial);
  const [setupState, setupAction, setupPending] = useActionState(enableBillingSetupAction, initial);
  const [rateState, rateAction, ratePending] = useActionState(setStripeMonthlyRateAction, initial);
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(startStripeCheckoutAction, initial);
  const [emailState, emailFormAction, emailPending] = useActionState(emailStripeCheckoutLinkAction, initial);
  const paymentUrl = checkoutState.url ?? emailState.url;
  const paymentMessage = checkoutState.message ?? emailState.message;
  const paymentEmailSent = checkoutState.emailSent ?? emailState.emailSent;
  const [ratePreset, setRatePreset] = useState<string>(
    stripeMonthlyRateXcd == null
      ? "default"
      : String(stripeMonthlyRateXcd) === String(defaultMonthlyRateXcd)
        ? "default"
        : [20, 25, 30].includes(stripeMonthlyRateXcd)
          ? String(stripeMonthlyRateXcd)
          : "custom",
  );
  const [customRate, setCustomRate] = useState(
    ratePreset === "custom" && stripeMonthlyRateXcd != null ? String(stripeMonthlyRateXcd) : "",
  );
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

  const isStripe = billingMode === "stripe_subscription";

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Billing</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Choose how this customer is billed. Payment links are copied or emailed to the customer — you are not
          redirected to Checkout unless you open the link yourself.
          {stripeConfigured ? ` ${checkoutInitialLinkNotice()} If the link expires, a recovery link can be emailed automatically when SMTP is configured.` : null}
          {!stripeConfigured ? " Stripe is off until STRIPE_SECRET_KEY is set." : null}
        </p>
      </div>

      {stripeBanner === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          Stripe Checkout completed. Status updates after webhooks process (usually within seconds).
        </p>
      ) : null}
      {stripeBanner === "cancel" ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Stripe Checkout was canceled.
        </p>
      ) : null}

      {setupState.message && !setupState.error ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {setupState.message}
        </p>
      ) : null}

      {billingSetup ? (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Provider links</p>
          <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            {billingSetup.stripeConfigured ? (
              <li>
                Stripe:{" "}
                {billingSetup.hasStripeAccount ? (
                  <span className="text-emerald-700 dark:text-emerald-400">linked</span>
                ) : isStripe ? (
                  <span className="text-amber-800 dark:text-amber-200">not linked — run setup below</span>
                ) : (
                  <span className="text-zinc-500">not required (manual billing)</span>
                )}
              </li>
            ) : null}
            {billingSetup.invoilessConfigured ? (
              <li>
                Invoiless:{" "}
                {billingSetup.hasInvoilessAccount ? (
                  <span className="text-emerald-700 dark:text-emerald-400">linked</span>
                ) : (
                  <span className="text-amber-800 dark:text-amber-200">not linked — run setup below</span>
                )}
              </li>
            ) : null}
          </ul>
          {billingSetup.needsSetup ? (
            <form action={setupAction} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="customerId" value={customerId} />
              <input type="hidden" name="billingMode" value={billingMode} />
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Links Stripe and/or Invoiless for this customer. Does not start Checkout — send a payment link when they are ready to pay by card.
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
        </div>
      ) : null}

      <form action={modeAction} className="flex flex-col gap-3">
        <input type="hidden" name="customerId" value={customerId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Billing setup</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="billingMode"
              value="manual_legacy"
              defaultChecked={!isStripe}
              className="text-emerald-600"
            />
            Manual / Invoiless invoices
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
              <span className="text-xs text-zinc-500">(set STRIPE_SECRET_KEY to enable)</span>
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

      {isStripe && stripeConfigured ? (
        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Payment &amp; Checkout</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Subscription status is shown above. Payment links expire in about 24 hours; Stripe recovery can email a
            follow-up link (about 30 days) after expiry when webhooks and SMTP are configured.
          </p>

          <form action={rateAction} className="mt-4 flex flex-col gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            <input type="hidden" name="customerId" value={customerId} />
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Per-vehicle monthly rate</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Catalog tiers $30 / $25 / $20 use fixed Stripe Prices (set under Subscription options). Custom rates
              use dynamic pricing. Default is {formatXcd(defaultMonthlyRateXcd)}/vehicle/month.
              {stripeMonthlyRateXcd != null ? (
                <>
                  {" "}
                  Saved: <strong>{formatXcd(stripeMonthlyRateXcd)}/month</strong>.
                </>
              ) : (
                <> Using catalog default.</>
              )}
            </p>
            <select
              className="block w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={ratePreset}
              onChange={(e) => setRatePreset(e.target.value)}
            >
              <option value="default">Default ({formatXcd(defaultMonthlyRateXcd)}/mo)</option>
              <option value="25">$25 / month</option>
              <option value="20">$20 / month</option>
              <option value="custom">Custom amount…</option>
            </select>
            {ratePreset === "custom" ? (
              <input
                type="number"
                min="1"
                step="0.01"
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
                placeholder="XCD per month"
                className="block w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
            ) : null}
            <input
              type="hidden"
              name="monthlyRateXcd"
              value={ratePreset === "custom" ? "custom" : ratePreset}
            />
            {ratePreset === "custom" ? (
              <input type="hidden" name="customMonthlyRateXcd" value={customRate} />
            ) : null}
            <button
              type="submit"
              disabled={ratePending}
              className="w-fit rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
            >
              {ratePending ? "Saving…" : "Save monthly rate"}
            </button>
            {rateState.error ? <p className="text-sm text-red-600">{rateState.error}</p> : null}
          </form>

          {planOptions.length > 0 ? (
            <form action={checkoutAction} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="customerId" value={customerId} />
              <input
                type="hidden"
                name="monthlyRateXcd"
                value={ratePreset === "custom" ? "custom" : ratePreset}
              />
              {ratePreset === "custom" ? (
                <input type="hidden" name="customMonthlyRateXcd" value={customRate} />
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="block text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Vehicles</span>
                  <input
                    type="number"
                    name="vehicleCount"
                    min={1}
                    max={9999}
                    defaultValue={String(defaultVehicleCount)}
                    className="mt-1 block w-full min-w-[5rem] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <span className="mt-0.5 block text-xs text-zinc-500">Stripe quantity (active assignments: {defaultVehicleCount})</span>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">Plan term</span>
                  <select
                    name="durationMonths"
                    className="mt-1 block w-full min-w-[12rem] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    defaultValue={String(planOptions[0]?.durationMonths ?? 1)}
                  >
                    {planOptions.map((p) => (
                      <option key={p.durationMonths} value={p.durationMonths}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={checkoutPending || emailPending}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
                >
                  {checkoutPending ? "Creating…" : "Create payment link"}
                </button>
                <button
                  type="submit"
                  formAction={emailFormAction}
                  disabled={checkoutPending || emailPending}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900"
                >
                  {emailPending ? "Sending…" : "Email link to customer"}
                </button>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {ratePreset === "custom"
                  ? "Checkout will use dynamic per-vehicle pricing for this custom rate."
                  : catalogConfigured
                    ? "Checkout uses Stripe catalog Price × vehicle count for the tier and term above."
                    : "No Stripe catalog Price configured for this tier/term — Checkout will use dynamic pricing. Add Price ids under Admin → Subscription options."}
              </p>
            </form>
          ) : (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              No subscription plans found. Run migrations/seed or check subscription options.
            </p>
          )}
          {checkoutState.error ? <p className="mt-2 text-sm text-red-600">{checkoutState.error}</p> : null}
          {emailState.error ? <p className="mt-2 text-sm text-red-600">{emailState.error}</p> : null}
          {paymentUrl ? (
            <CheckoutPaymentLink
              url={paymentUrl}
              message={paymentMessage}
              emailSent={paymentEmailSent}
            />
          ) : null}

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
        </div>
      ) : null}

      {invoilessConfigured ? (
        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Invoiless (accounting)</h3>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              {hasInvoilessId
                ? isStripe
                  ? "Linked for accounting. Paid Stripe invoices can mirror here automatically; manual invoices stay in Admin → Invoices."
                  : "Linked. Push sends billing address, legal info, notes, tags, and invoice Cc/Bcc."
                : "Not linked. Sync creates the contact in Invoiless for invoices and paid mirrors."}
            </p>
            <SyncInvoilessButton customerId={customerId} hasInvoilessId={hasInvoilessId} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Set INVOILESS_API_KEY for Invoiless accounting sync.</p>
      )}
    </section>
  );
}

function CheckoutPaymentLink({
  url,
  message,
  emailSent,
}: {
  url: string;
  message?: string;
  emailSent?: boolean;
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
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          readOnly
          value={url}
          className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs text-zinc-800 dark:border-emerald-800 dark:bg-zinc-950 dark:text-zinc-200"
          onFocus={(e) => e.target.select()}
        />
        <div>
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
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-center text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
          >
            Open Checkout
          </a>
        </div>
      </div>
    </div>
  );
}
