"use client";

import { useFormState } from "react-dom";
import type { Customer } from "@prisma/client";

import {
  createCustomer,
  customerFormInitialState,
  updateCustomer,
  type ActionState,
} from "@/app/admin/customers/actions";

function toFormDefaults(customer: Customer) {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    company: customer.company,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes,
    tags: customer.tags?.length ? customer.tags.join(", ") : "",
  };
}

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export function CustomerCreateForm() {
  const [state, formAction] = useFormState(createCustomer, customerFormInitialState);
  return <CustomerFormInner formAction={formAction} state={state} defaults={{}} />;
}

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const [state, formAction] = useFormState(updateCustomer, customerFormInitialState);
  const d = toFormDefaults(customer);
  return <CustomerFormInner formAction={formAction} state={state} defaults={d} customerId={customer.id} />;
}

function CustomerFormInner({
  formAction,
  state,
  defaults,
  customerId,
}: {
  formAction: (payload: FormData) => void;
  state: ActionState;
  defaults: Partial<
    Pick<Customer, "firstName" | "lastName" | "company" | "email" | "phone" | "address" | "notes">
  > & { tags?: string };
  customerId?: string;
}) {
  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {customerId ? <input type="hidden" name="id" value={customerId} /> : null}
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {state.error}
        </p>
      ) : null}

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
          Company
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

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="email">
          Email
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

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="phone">
          Phone
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
        />
      </div>

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
        <p className="mt-1 text-xs text-zinc-500">Comma-separated, max 10.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="notes">
          Internal notes
        </label>
        <textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes ?? ""} className={inputClass} />
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
