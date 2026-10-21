"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { replaceDeviceWithinService } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import { UnlinkedSimPicker } from "@/components/admin/unlinked-sim-picker";
import { useDeviceFormActionNav } from "@/components/admin/use-device-form-action-nav";
import type { UnlinkedSimRow } from "@/lib/admin/unlinked-sim-filter";

const inputClass = "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500">{pending ? "Replacing…" : "Replace device"}</button>;
}

export function DeviceReplaceForm({ assignmentId, devices, currentSimId, availableSims }: {
  assignmentId: string;
  devices: { id: string; label: string }[];
  currentSimId: string | null;
  availableSims: UnlinkedSimRow[];
}) {
  const [state, action] = useActionState(replaceDeviceWithinService, deviceFormInitialState);
  useDeviceFormActionNav(state);
  const today = new Date().toISOString().slice(0, 10);
  return <section className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Replace device</h3>
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Replaces this physical installation only. It preserves the current service identity, commercial terms, billing dates, invoices, and provider authority.</p>
    <form action={action} className="mt-4 max-w-xl space-y-4">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {state.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
      {state.message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{state.message}</p> : null}
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Replacement device<select required name="replacementDeviceId" defaultValue="" className={inputClass}><option value="" disabled>Select a sound in-stock device…</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Effective date<input required name="effectiveDate" type="date" defaultValue={today} className={inputClass} /></label>
      <fieldset className="space-y-2"><legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">SIM handling</legend>
        {currentSimId ? <label className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"><input type="radio" name="simDisposition" value="move_current" defaultChecked /> Move the current SIM to the replacement device</label> : null}
        <label className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"><input type="radio" name="simDisposition" value="select" defaultChecked={!currentSimId} /> Use another eligible SIM</label>
        <label className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"><input type="radio" name="simDisposition" value="none" /> Install without a SIM</label>
        <p className="text-xs text-amber-800 dark:text-amber-200">A provider or APN change may need manual follow-up. GPS setup commands are not changed automatically.</p>
      </fieldset>
      <UnlinkedSimPicker inputName="replacementSimCardId" sims={availableSims} availabilityHint="Only choose a SIM here when ‘Use another eligible SIM’ is selected." />
      <fieldset className="space-y-2"><legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Old hardware disposition</legend>
        <label className="flex gap-2 text-sm"><input type="radio" name="oldHardwareDisposition" value="in_stock" defaultChecked /> Physically recovered and returned to stock</label>
        <label className="flex gap-2 text-sm"><input type="radio" name="oldHardwareDisposition" value="faulty_returned" /> Returned but faulty</label>
        <label className="flex gap-2 text-sm"><input type="radio" name="oldHardwareDisposition" value="lost" /> Lost or unrecovered</label>
      </fieldset>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Reason (optional)<input name="reason" className={inputClass} /></label>
      <Submit />
    </form>
  </section>;
}
