"use client";

import { useActionState } from "react";

import { submitRegistrationRequest } from "@/app/register/actions";
import {
  registerFormInitialState,
  type RegisterFormState,
} from "@/app/register/register-form-state";

type SubscriptionRow = { id: string; label: string };

function fieldClass() {
  return "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
}

function labelClass() {
  return "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
}

export function RegistrationForm({ subscriptionOptions }: { subscriptionOptions: SubscriptionRow[] }) {
  const [state, formAction, pending] = useActionState<RegisterFormState, FormData>(
    submitRegistrationRequest,
    registerFormInitialState,
  );

  if (state.ok === true) {
    return (
      <div
        className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
        role="status"
      >
        {state.message}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.ok === false ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass()} htmlFor="reg-firstName">
            First name <span className="text-red-600">*</span>
          </label>
          <input id="reg-firstName" name="firstName" type="text" required autoComplete="given-name" className={fieldClass()} />
        </div>
        <div>
          <label className={labelClass()} htmlFor="reg-lastName">
            Last name <span className="text-red-600">*</span>
          </label>
          <input id="reg-lastName" name="lastName" type="text" required autoComplete="family-name" className={fieldClass()} />
        </div>
      </div>

      <div>
        <label className={labelClass()} htmlFor="reg-phone">
          WhatsApp phone number <span className="text-red-600">*</span>
        </label>
        <input
          id="reg-phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="e.g. 758…"
          className={fieldClass()}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">We use this as your primary phone on file.</p>
      </div>

      <div>
        <label className={labelClass()} htmlFor="reg-email">
          Email <span className="text-red-600">*</span>
        </label>
        <input id="reg-email" name="email" type="email" required autoComplete="email" className={fieldClass()} />
      </div>

      <div>
        <label className={labelClass()} htmlFor="reg-vehicles">
          Vehicle details <span className="text-red-600">*</span>
        </label>
        <textarea
          id="reg-vehicles"
          name="vehicleDetails"
          required
          rows={5}
          placeholder={"One vehicle per line, e.g.\nToyota Vitz – PK1234\nSuzuki Jimny – PJ5678"}
          className={`${fieldClass()} min-h-[120px]`}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          If more than one vehicle, list each on a new line. Staff will add devices in TL Portal from this text.
        </p>
      </div>

      {subscriptionOptions.length > 0 ? (
        <div>
          <label className={labelClass()} htmlFor="reg-subscription">
            Subscription option
          </label>
          <select id="reg-subscription" name="subscriptionOptionId" className={fieldClass()} defaultValue="">
            <option value="">Choose…</option>
            {subscriptionOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Billed monthly per vehicle. Selection is recorded in your customer notes for our team.
          </p>
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Subscription options are not listed yet — you can still submit; staff will confirm billing with you.
        </p>
      )}

      <fieldset className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
        <legend className={labelClass()}>Terms acknowledgement</legend>
        <label className="flex cursor-pointer gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input type="checkbox" name="termInstallAfterPayment" className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600" />
          <span>
            I understand that installation is scheduled after payment and confirmation. <span className="text-red-600">*</span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input type="checkbox" name="termHardwarePerVehicle" className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600" />
          <span>
            I understand that each vehicle requires a GPS tracking device, charged as a one-time hardware fee per vehicle, at
            the current listed price communicated at the time of booking. <span className="text-red-600">*</span>
          </span>
        </label>
        <label className="flex cursor-pointer gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input type="checkbox" name="termTravelFee" className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600" />
          <span>
            I understand that a travel fee may apply based on the installation location. <span className="text-red-600">*</span>
          </span>
        </label>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
      >
        {pending ? "Submitting…" : "Submit registration"}
      </button>
    </form>
  );
}
