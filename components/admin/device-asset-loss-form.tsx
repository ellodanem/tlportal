"use client";

import Link from "next/link";
import { useActionState, useEffect, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { recordDeviceAssetLoss } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import { ASSET_LOSS_REASON_LABEL } from "@/lib/domain/asset-loss";

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 dark:border-zinc-700 dark:bg-zinc-950";
const boxClass = "rounded-lg border border-red-300 bg-red-50/50 p-5 dark:border-red-900/60 dark:bg-red-950/20";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 min-h-11 rounded-lg border border-red-400 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
    >
      {pending ? "Recording…" : "Record asset as lost"}
    </button>
  );
}

/**
 * `legacy`: shows the form. `canonical`: billing belongs to a subscription, so point staff there.
 * `none`: nothing to record; only the last success notice is kept (the form unmounts its own
 * assignment once the loss is saved, so the component must stay mounted to show the result).
 */
export function DeviceAssetLossForm({ deviceId, mode }: { deviceId: string; mode: "legacy" | "canonical" | "none" }) {
  const [state, formAction] = useActionState(recordDeviceAssetLoss, deviceFormInitialState);
  const router = useRouter();
  useEffect(() => {
    if (state.message) router.refresh();
  }, [router, state.message]);

  if (mode === "none") {
    return state.message ? (
      <section className={boxClass}>
        <h3 className="font-semibold text-red-950 dark:text-red-100">Asset lost / unrecoverable</h3>
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{state.message}</p>
      </section>
    ) : null;
  }

  if (mode === "canonical") {
    return (
      <section className={boxClass}>
        <h3 className="font-semibold text-red-950 dark:text-red-100">Asset lost / unrecoverable</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          This tracker is billed through a subscription. Open the service on its{" "}
          <Link href="/admin/subscriptions/canonical" className="font-semibold underline">Subscriptions</Link>{" "}
          page and use <strong>Asset lost / unrecoverable</strong> so billing ends together with the installation.
        </p>
      </section>
    );
  }

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm("Record this device as lost and unrecoverable? The installation ends on the chosen date, invoice schedules for it end, and the device is written off. This cannot be resumed.")) {
      event.preventDefault();
    }
  };

  return (
    <form action={formAction} onSubmit={confirm} className={boxClass}>
      <input type="hidden" name="deviceId" value={deviceId} />
      <h3 className="font-semibold text-red-950 dark:text-red-100">Asset lost / unrecoverable</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        Use when the vehicle or boat is gone for good and the tracker cannot be recovered. Ends this installation, ends its recurring invoice schedules,
        writes the device off as <strong>lost</strong> and unlinks its SIM. Past invoices are not changed.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Date of loss<input required type="date" name="lossDate" className={inputClass} /></label>
        <label className="text-sm font-medium">
          What happened
          <select required name="lossReason" defaultValue="sank" className={inputClass}>
            {Object.entries(ASSET_LOSS_REASON_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">Note (optional)<input name="lossNote" className={inputClass} placeholder="e.g. Vessel sank off Rodney Bay; insurance claim filed" /></label>
      </div>
      {state.error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
      {state.message ? <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{state.message}</p> : null}
      <SubmitButton />
    </form>
  );
}
