"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { registerDevice } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

type DeviceModelOption = { id: string; name: string; manufacturer: string | null };
type SimOption = { id: string; iccid: string; label: string | null; msisdn: string | null };
type CustomerOption = { id: string; label: string };

function SubmitButton({ modelsEmpty }: { modelsEmpty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || modelsEmpty}
      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
    >
      {pending ? "Saving…" : "Register device"}
    </button>
  );
}

export function DeviceRegisterForm({
  deviceModels,
  unlinkedSims,
  customers,
  defaultStartDate,
}: {
  deviceModels: DeviceModelOption[];
  unlinkedSims: SimOption[];
  customers: CustomerOption[];
  defaultStartDate: string;
}) {
  const [state, formAction] = useActionState(registerDevice, deviceFormInitialState);
  const modelsEmpty = deviceModels.length === 0;

  return (
    <form action={formAction} className="max-w-2xl space-y-8">
      {state.error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      {modelsEmpty ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          No active device models in the database. Add a{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/80">DeviceModel</code> record (e.g. in Prisma
          Studio) or run <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/80">npm run db:seed</code> after
          seed includes a default model.
        </p>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Device</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">IMEI and model are required. Everything else is optional.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="deviceModelId">
            Device model <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <select
            id="deviceModelId"
            name="deviceModelId"
            required={!modelsEmpty}
            disabled={modelsEmpty}
            className={inputClass}
            defaultValue=""
          >
            <option value="" disabled>
              Select model…
            </option>
            {deviceModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.manufacturer?.trim() ? `${m.manufacturer.trim()} — ${m.name}` : m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="imei">
            IMEI <span className="text-red-600 dark:text-red-400">*</span>
          </label>
          <input
            id="imei"
            name="imei"
            required
            autoComplete="off"
            placeholder="e.g. 35xxxxxxxxxxxx"
            className={`${inputClass} font-mono`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="serialNumber">
              Serial number
            </label>
            <input id="serialNumber" name="serialNumber" autoComplete="off" className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="label">
              Friendly label
            </label>
            <input id="label" name="label" placeholder="e.g. Van-12" autoComplete="off" className={inputClass} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="condition">
              Condition
            </label>
            <select id="condition" name="condition" className={inputClass} defaultValue="new">
              <option value="new">New</option>
              <option value="refurbished">Refurbished</option>
              <option value="faulty">Faulty</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="firmwareVersion">
              Firmware version
            </label>
            <input id="firmwareVersion" name="firmwareVersion" autoComplete="off" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={3} className={inputClass} />
        </div>
      </section>

      <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-700">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">SIM (optional)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Link a SIM that is not already on a device. Import inventory from{" "}
            <Link href="/admin/sims" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              SIM cards
            </Link>
            .
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="simCardId">
            Cellular SIM
          </label>
          <select id="simCardId" name="simCardId" className={inputClass} defaultValue="">
            <option value="">No SIM linked</option>
            {unlinkedSims.map((s) => (
              <option key={s.id} value={s.id}>
                {s.iccid}
                {s.label?.trim() ? ` — ${s.label.trim()}` : ""}
                {s.msisdn?.trim() ? ` (${s.msisdn.trim()})` : ""}
              </option>
            ))}
          </select>
          {unlinkedSims.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-500">No unlinked SIMs available.</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-700">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Service assignment (optional)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Assign to a customer to bill and track service. Leave unassigned to keep the device <strong>in stock</strong>
            .
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="customerId">
            Customer
          </label>
          <select id="customerId" name="customerId" className={inputClass} defaultValue="">
            <option value="">Keep in stock (unassigned)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {customers.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              No customers yet —{" "}
              <Link href="/admin/customers/new" className="text-emerald-700 hover:underline dark:text-emerald-400">
                add a customer
              </Link>{" "}
              first.
            </p>
          ) : null}
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="startDate">
            Service start date
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={defaultStartDate}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500">Required when a customer is selected.</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-700">
        <SubmitButton modelsEmpty={modelsEmpty} />
        <Link
          href="/admin/devices"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
