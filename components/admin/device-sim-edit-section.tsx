"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { clearDeviceSimCard, updateDeviceLinkedSim } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import { UnlinkedSimPicker } from "@/components/admin/unlinked-sim-picker";
import type { UnlinkedSimRow } from "@/lib/admin/unlinked-sim-filter";

const swapAvailabilityHint =
  "SIMs already on this device stay selectable; other devices and active assignments reserve a card. Choose one and save, or remove the link below.";

function PrimarySubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function DangerSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-xl border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-800 shadow-sm transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export function DeviceSimEditSection({
  deviceId,
  canEditSim,
  currentSim,
  swapSims,
}: {
  deviceId: string;
  canEditSim: boolean;
  currentSim: { id: string; iccid: string; msisdn: string | null; label: string | null } | null;
  swapSims: UnlinkedSimRow[];
}) {
  const [linkState, linkAction] = useActionState(updateDeviceLinkedSim, deviceFormInitialState);
  const [clearState, clearAction] = useActionState(clearDeviceSimCard, deviceFormInitialState);

  return (
    <section
      id="device-sim"
      className="scroll-mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">SIM card</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Link, swap, or remove the SIM associated with this device. An active customer assignment uses the same SIM for
        consistency with billing records.
      </p>

      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950/50">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Currently linked</p>
        {currentSim ? (
          <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            <Link
              href={`/admin/sims/${currentSim.id}`}
              className="font-mono text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {currentSim.iccid}
            </Link>
            {currentSim.msisdn?.trim() ? (
              <span className="text-zinc-600 dark:text-zinc-400"> · {currentSim.msisdn.trim()}</span>
            ) : null}
            {currentSim.label?.trim() ? (
              <span className="block text-xs text-zinc-600 dark:text-zinc-400">Label: {currentSim.label.trim()}</span>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No SIM linked.</p>
        )}
      </div>

      {!canEditSim ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          SIM cannot be changed while the device is decommissioned or lost.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Link or swap
            </h3>
            <form action={linkAction} className="mt-3 space-y-4">
              <input type="hidden" name="deviceId" value={deviceId} />
              {linkState.error ? (
                <p
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                  role="alert"
                >
                  {linkState.error}
                </p>
              ) : null}
              {swapSims.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No SIM cards are available to link (all are on other devices or open assignments). Free a SIM
                  elsewhere first, or remove the current link below.
                </p>
              ) : (
                <UnlinkedSimPicker sims={swapSims} availabilityHint={swapAvailabilityHint} />
              )}
              {swapSims.length > 0 ? <PrimarySubmit label="Save linked SIM" /> : null}
            </form>
          </div>

          {currentSim ? (
            <div className="border-t border-zinc-200 pt-6 dark:border-zinc-700">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Remove link
              </h3>
              <form
                action={clearAction}
                className="mt-3 space-y-4"
                onSubmit={(e) => {
                  if (!window.confirm("Remove the SIM link from this device (and active assignment, if any)?")) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="deviceId" value={deviceId} />
                {clearState.error ? (
                  <p
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                    role="alert"
                  >
                    {clearState.error}
                  </p>
                ) : null}
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  The SIM record stays in the catalog; only the connection to this device is cleared.
                </p>
                <DangerSubmit label="Remove SIM from device" />
              </form>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
