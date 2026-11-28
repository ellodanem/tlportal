"use client";

import Link from "next/link";
import { useActionState } from "react";

import { updateCustomerNew } from "@/app/admin/customer-new/actions";
import { customerFormInitialState } from "@/app/admin/customers/customer-form-state";

const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white min-h-11 px-3 py-2 text-base text-zinc-900 shadow-sm outline-none focus:border-emerald-500 sm:min-h-10 sm:text-sm focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
const sectionClass = "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

export type EditCustomerProfileDefaults = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  legalInfo: string | null;
  invoiceCc: string | null;
  invoiceBcc: string | null;
  notes: string | null;
  tags: string;
};

export function EditCustomerProfileForm({
  customerId,
  defaults,
  cancelHref,
}: {
  customerId: string;
  defaults: EditCustomerProfileDefaults;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(updateCustomerNew, customerFormInitialState);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="id" value={customerId} />
      <input type="hidden" name="section" value="profile" />
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-4">
        <h2 className={sectionClass}>Customer</h2>
        <div>
          <label className={labelClass} htmlFor="company">
            Company name
          </label>
          <input id="company" name="company" defaultValue={defaults.company ?? ""} autoComplete="organization" className={inputClass} />
          <p className="mt-1 text-xs text-zinc-500">Required if you don&apos;t enter both first and last name.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="firstName">
              First name
            </label>
            <input id="firstName" name="firstName" defaultValue={defaults.firstName ?? ""} autoComplete="given-name" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="lastName">
              Last name
            </label>
            <input id="lastName" name="lastName" defaultValue={defaults.lastName ?? ""} autoComplete="family-name" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              Email address
            </label>
            <input id="email" name="email" type="email" defaultValue={defaults.email ?? ""} autoComplete="email" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={defaults.phone ?? ""}
              autoComplete="tel"
              placeholder="+1 758 555 1234"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Include the country code.</p>
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          If this customer is linked to Stripe, Save also updates Stripe email, phone, and name. An open Checkout link still shows the old email until you cancel it.
        </p>
      </div>

      <div className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className={sectionClass}>Billing address</h2>
        <div>
          <label className={labelClass} htmlFor="address">
            Address
          </label>
          <textarea
            id="address"
            name="address"
            rows={2}
            defaultValue={defaults.address ?? ""}
            placeholder="Street, building, etc."
            className={inputClass}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="city">
              City
            </label>
            <input id="city" name="city" defaultValue={defaults.city ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="state">
              State / province
            </label>
            <input id="state" name="state" defaultValue={defaults.state ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="postalCode">
              Postal code
            </label>
            <input id="postalCode" name="postalCode" defaultValue={defaults.postalCode ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="country">
              Country
            </label>
            <input id="country" name="country" defaultValue={defaults.country ?? ""} autoComplete="country-name" className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="legalInfo">
            Legal info
          </label>
          <textarea
            id="legalInfo"
            name="legalInfo"
            rows={2}
            defaultValue={defaults.legalInfo ?? ""}
            placeholder="Company or tax registration number"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">Maps to Invoiless legal / registration (max 100 characters on sync).</p>
        </div>
      </div>

      <div className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className={sectionClass}>Invoice emails</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Optional. Invoiless attaches these on invoice emails (max three addresses each; comma-separated).
        </p>
        <div>
          <label className={labelClass} htmlFor="invoiceCc">
            Copy (Cc)
          </label>
          <input
            id="invoiceCc"
            name="invoiceCc"
            defaultValue={defaults.invoiceCc ?? ""}
            placeholder="Cc (separate multiple emails with a comma)"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="invoiceBcc">
            Blind (Bcc)
          </label>
          <input
            id="invoiceBcc"
            name="invoiceBcc"
            defaultValue={defaults.invoiceBcc ?? ""}
            placeholder="Bcc (separate multiple emails with a comma)"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className={sectionClass}>Tags &amp; notes</h2>
        <div>
          <label className={labelClass} htmlFor="tags">
            Tags
          </label>
          <input id="tags" name="tags" defaultValue={defaults.tags} placeholder="e.g. fleet, vip" className={inputClass} />
          <p className="mt-1 text-xs text-zinc-500">Comma-separated, max 10.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes ?? ""} className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
        <Link
          href={cancelHref}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          Save profile
        </button>
      </div>
    </form>
  );
}
