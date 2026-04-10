"use client";

import { useActionState } from "react";
import type { Customer } from "@prisma/client";

import { createCustomer, updateCustomer } from "@/app/admin/customers/actions";
import {
  customerFormInitialState,
  type CustomerFormActionState,
} from "@/app/admin/customers/customer-form-state";

const sectionTitleClass =
  "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

function toFormDefaults(customer: Customer) {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    company: customer.company,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    state: customer.state,
    postalCode: customer.postalCode,
    country: customer.country,
    legalInfo: customer.legalInfo,
    invoiceCc: customer.invoiceCc,
    invoiceBcc: customer.invoiceBcc,
    traqcareUsername: customer.traqcareUsername,
    traqcarePortalUrl: customer.traqcarePortalUrl,
    notes: customer.notes,
    tags: customer.tags?.length ? customer.tags.join(", ") : "",
  };
}

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export function CustomerCreateForm() {
  const [state, formAction] = useActionState(createCustomer, customerFormInitialState);
  return <CustomerFormInner formAction={formAction} state={state} defaults={{}} />;
}

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const [state, formAction] = useActionState(updateCustomer, customerFormInitialState);
  const d = toFormDefaults(customer);
  return (
    <CustomerFormInner
      formAction={formAction}
      state={state}
      defaults={d}
      customerId={customer.id}
      hasStoredTraqcarePassword={Boolean(customer.traqcarePassword)}
    />
  );
}

type FormDefaults = Partial<
  Pick<
    Customer,
    | "firstName"
    | "lastName"
    | "company"
    | "email"
    | "phone"
    | "address"
    | "city"
    | "state"
    | "postalCode"
    | "country"
    | "legalInfo"
    | "invoiceCc"
    | "invoiceBcc"
    | "traqcareUsername"
    | "traqcarePortalUrl"
    | "notes"
  >
> & { tags?: string };

function CustomerFormInner({
  formAction,
  state,
  defaults,
  customerId,
  hasStoredTraqcarePassword = false,
}: {
  formAction: (payload: FormData) => void;
  state: CustomerFormActionState;
  defaults: FormDefaults;
  customerId?: string;
  /** Edit only: whether a password is already saved (never shown in the form). */
  hasStoredTraqcarePassword?: boolean;
}) {
  return (
    <form action={formAction} className="max-w-xl space-y-6">
      {customerId ? <input type="hidden" name="id" value={customerId} /> : null}
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-4">
        <h2 className={sectionTitleClass}>Billing info</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="firstName">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              defaultValue={defaults.firstName ?? ""}
              className={inputClass}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="lastName">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              defaultValue={defaults.lastName ?? ""}
              className={inputClass}
              autoComplete="family-name"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="company">
            Company name
          </label>
          <input
            id="company"
            name="company"
            defaultValue={defaults.company ?? ""}
            className={inputClass}
            autoComplete="organization"
          />
          <p className="mt-1 text-xs text-zinc-500">Required if you don&apos;t use both first and last name.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={defaults.email ?? ""}
              className={inputClass}
              autoComplete="email"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="phone">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={defaults.phone ?? ""}
              className={inputClass}
              autoComplete="tel"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="address">
            Address
          </label>
          <textarea
            id="address"
            name="address"
            rows={3}
            defaultValue={defaults.address ?? ""}
            className={inputClass}
            placeholder="Street, building, etc."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="city">
              City
            </label>
            <input id="city" name="city" defaultValue={defaults.city ?? ""} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="state">
              State / province
            </label>
            <input id="state" name="state" defaultValue={defaults.state ?? ""} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="postalCode">
              Postal code
            </label>
            <input id="postalCode" name="postalCode" defaultValue={defaults.postalCode ?? ""} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="country">
              Country
            </label>
            <input
              id="country"
              name="country"
              defaultValue={defaults.country ?? ""}
              className={inputClass}
              autoComplete="country-name"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="legalInfo">
            Legal info
          </label>
          <textarea
            id="legalInfo"
            name="legalInfo"
            rows={2}
            defaultValue={defaults.legalInfo ?? ""}
            className={inputClass}
            placeholder="e.g. company or tax registration number"
          />
          <p className="mt-1 text-xs text-zinc-500">Maps to Invoiless legal / registration (max 100 characters on sync).</p>
        </div>
      </div>

      <div className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className={sectionTitleClass}>Invoice emails</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Optional. Invoiless attaches these on invoice emails (max three addresses each; comma-separated).
        </p>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="invoiceCc">
            Copy (Cc)
          </label>
          <input
            id="invoiceCc"
            name="invoiceCc"
            defaultValue={defaults.invoiceCc ?? ""}
            className={inputClass}
            placeholder="Cc (separate multiple emails with a comma)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="invoiceBcc">
            Blind (Bcc)
          </label>
          <input
            id="invoiceBcc"
            name="invoiceBcc"
            defaultValue={defaults.invoiceBcc ?? ""}
            className={inputClass}
            placeholder="Bcc (separate multiple emails with a comma)"
          />
        </div>
      </div>

      <div className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className={sectionTitleClass}>Traqcare (GPS)</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Optional login for the Traqcare tracking portal. Values are stored in the database as plain text — limit who can
          access this admin app.
        </p>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="traqcareUsername">
            Username
          </label>
          <input
            id="traqcareUsername"
            name="traqcareUsername"
            autoComplete="off"
            defaultValue={defaults.traqcareUsername ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="traqcarePassword">
            Password
          </label>
          <input
            id="traqcarePassword"
            name="traqcarePassword"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            placeholder={hasStoredTraqcarePassword ? "Leave blank to keep current password" : "Optional"}
          />
          {hasStoredTraqcarePassword ? (
            <p className="mt-1 text-xs text-zinc-500">A password is already saved for this customer.</p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="traqcarePortalUrl">
            Portal URL
          </label>
          <input
            id="traqcarePortalUrl"
            name="traqcarePortalUrl"
            type="url"
            inputMode="url"
            placeholder="https://…"
            defaultValue={defaults.traqcarePortalUrl ?? ""}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">Use if this customer uses a non-default or white-label Traqcare URL.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" name="traqcarePasswordClear" value="1" className="mt-1 rounded border-zinc-300" />
          <span>Remove stored Traqcare password</span>
        </label>
      </div>

      <div className="space-y-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className={sectionTitleClass}>Tags &amp; notes</h2>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="tags">
            Tags
          </label>
          <input
            id="tags"
            name="tags"
            defaultValue={typeof defaults.tags === "string" ? defaults.tags : ""}
            placeholder="e.g. fleet, vip"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">Comma-separated, max 10 (Invoiless:50 characters per tag).</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes ?? ""} className={inputClass} />
          <p className="mt-1 text-xs text-zinc-500">Private notes; synced to Invoiless when you push (max 1000 characters there).</p>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          {customerId ? "Save changes" : "Create customer"}
        </button>
      </div>
    </form>
  );
}
