"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createManualSim } from "@/app/admin/sims/actions";

const inputClass = "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-50 dark:bg-emerald-500">{pending ? "Saving…" : "Add SIM"}</button>;
}

export function ManualSimForm() {
  const [state, action] = useActionState(createManualSim, { error: null });
  return <form action={action} className="max-w-2xl space-y-6">
    {state.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{state.error}</p> : null}
    <p className="text-sm text-zinc-600 dark:text-zinc-400">Manual SIMs remain unlinked until assigned. Their network state and usage are unknown unless a compatible provider integration is added.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ICCID *<input name="iccid" required autoComplete="off" className={`${inputClass} font-mono`} /></label>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Provider name *<input name="providerName" required autoComplete="organization" className={inputClass} /></label>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Label<input name="label" autoComplete="off" className={inputClass} /></label>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">MSISDN<input name="msisdn" autoComplete="off" className={`${inputClass} font-mono`} /></label>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">IMSI<input name="imsi" autoComplete="off" className={`${inputClass} font-mono`} /></label>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Reported quota (MB)<input name="totalDataMB" type="number" min="0" step="any" className={inputClass} /></label>
    </div>
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Notes<textarea name="notes" rows={3} className={inputClass} /></label>
    <div className="flex items-center gap-4"><Submit /><Link href="/admin/sims" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400">Cancel</Link></div>
  </form>;
}
