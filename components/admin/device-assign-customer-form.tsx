"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { assignDeviceToCustomer } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import { formatPlanTerm, SUBSCRIPTION_PLAN_MONTHS } from "@/lib/subscription-options/display";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

type CustomerOption = { id: string; label: string };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? "Assigning…" : "Assign to customer"}
    </button>
  );
}

export function DeviceAssignToCustomerForm({
  deviceId,
  customers,
}: {
  deviceId: string;
  customers: CustomerOption[];
}) {
  const [state, formAction] = useActionState(assignDeviceToCustomer, deviceFormInitialState);
  const noCustomers = customers.length === 0;

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      {state.error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="assign-customerId">
          Customer
        </label>
        <select
          id="assign-customerId"
          name="customerId"
          required
          disabled={noCustomers}
          className={inputClass}
          defaultValue=""
        >
          <option value="" disabled>
            {noCustomers ? "Add a customer first" : "Select customer…"}
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {noCustomers ? (
          <p className="mt-1 text-xs text-zinc-500">
            <Link href="/admin/customers/new" className="text-emerald-700 hover:underline dark:text-emerald-400">
              Create a customer
            </Link>{" "}
            to assign this device.
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="assign-startDate">
          Service start date
        </label>
        <input id="assign-startDate" name="startDate" type="date" className={inputClass} />
        <p className="mt-1 text-xs text-zinc-500">Optional.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="assign-intervalMonths">
          Billing term
        </label>
        <select id="assign-intervalMonths" name="intervalMonths" defaultValue="" className={inputClass}>
          <option value="">Not set (add later on Manage device)</option>
          {SUBSCRIPTION_PLAN_MONTHS.map((m) => (
            <option key={m} value={String(m)}>
              {formatPlanTerm(m)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">How often this device renews. You can change it anytime under Manage device.</p>
      </div>

      <SubmitButton disabled={noCustomers} />
    </form>
  );
}
