"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { replaceDeviceWithinService } from "@/app/admin/devices/actions";
import { deviceFormInitialState } from "@/app/admin/devices/device-form-state";
import { UnlinkedSimPicker } from "@/components/admin/unlinked-sim-picker";
import { useDeviceFormActionNav } from "@/components/admin/use-device-form-action-nav";
import type { UnlinkedSimRow } from "@/lib/admin/unlinked-sim-filter";

type Step = "replacement" | "sim" | "review";

const inputClass = "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function CommitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50 dark:bg-emerald-600">{pending ? "Replacing…" : "Replace device"}</button>;
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "replacement", label: "Replacement device" },
    { id: "sim", label: "SIM handling" },
    { id: "review", label: "Review" },
  ];
  const current = steps.findIndex((item) => item.id === step);
  return <ol className="grid gap-3 border-b border-zinc-200 pb-5 sm:grid-cols-3 dark:border-zinc-800">
    {steps.map((item, index) => <li key={item.id} className="flex items-center gap-2 text-sm"><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${index <= current ? "bg-emerald-700 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>{index < current ? "✓" : index + 1}</span><span className={index === current ? "font-semibold text-emerald-800 dark:text-emerald-300" : "text-zinc-500"}>{item.label}</span></li>)}
  </ol>;
}

export function DeviceReplacementWorkflow({
  assignmentId,
  currentInstallation,
  devices,
  currentSim,
  availableSims,
}: {
  assignmentId: string;
  currentInstallation: { customer: string; device: string; service: string };
  devices: { id: string; label: string; detail: string }[];
  currentSim: { id: string; iccid: string } | null;
  availableSims: UnlinkedSimRow[];
}) {
  const [state, action] = useActionState(replaceDeviceWithinService, deviceFormInitialState);
  const [step, setStep] = useState<Step>("replacement");
  const [replacementId, setReplacementId] = useState("");
  const [simDisposition, setSimDisposition] = useState<"move_current" | "select" | "none">(currentSim ? "move_current" : "select");
  const [selectedSim, setSelectedSim] = useState<UnlinkedSimRow | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [oldHardwareDisposition, setOldHardwareDisposition] = useState("in_stock");
  const [reason, setReason] = useState("");
  useDeviceFormActionNav(state);

  const replacement = devices.find((device) => device.id === replacementId);
  const canContinue = step === "replacement" ? Boolean(replacementId && effectiveDate) : step === "sim" ? simDisposition !== "select" || Boolean(selectedSim) : true;
  const goNext = () => {
    if (!canContinue) return;
    setStep(step === "replacement" ? "sim" : "review");
  };

  return <form action={action} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7">
    <input type="hidden" name="assignmentId" value={assignmentId} />
    <input type="hidden" name="replacementDeviceId" value={replacementId} />
    <input type="hidden" name="effectiveDate" value={effectiveDate} />
    <input type="hidden" name="simDisposition" value={simDisposition} />
    <input type="hidden" name="replacementSimCardId" value={selectedSim?.id ?? ""} />
    <input type="hidden" name="oldHardwareDisposition" value={oldHardwareDisposition} />
    <input type="hidden" name="reason" value={reason} />
    <Stepper step={step} />
    {state.error ? <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p> : null}
    {state.message ? <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{state.message}</p> : null}

    {step === "replacement" ? <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-700"><h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Current installation</h2><dl className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-zinc-800"><div className="flex justify-between gap-4 py-2"><dt className="text-zinc-500">Customer</dt><dd className="font-medium text-right">{currentInstallation.customer}</dd></div><div className="flex justify-between gap-4 py-2"><dt className="text-zinc-500">Installed device</dt><dd className="font-medium text-right">{currentInstallation.device}</dd></div><div className="flex justify-between gap-4 py-2"><dt className="text-zinc-500">Service association</dt><dd className="font-medium text-emerald-700">{currentInstallation.service}</dd></div></dl><p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">This changes physical equipment only. It does not create a billable service or change pricing.</p></section>
      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-700"><h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Choose a replacement device</h2><p className="mt-1 text-sm text-zinc-500">Only sound, in-stock devices are listed.</p><div className="mt-4 space-y-2">{devices.length ? devices.map((device) => <label key={device.id} className={`block cursor-pointer rounded-lg border p-3 transition ${replacementId === device.id ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 hover:border-emerald-300 dark:border-zinc-700"}`}><input className="sr-only" type="radio" checked={replacementId === device.id} onChange={() => setReplacementId(device.id)} /><span className="block font-medium text-zinc-900 dark:text-zinc-50">{device.label}</span><span className="mt-1 block text-xs text-zinc-500">{device.detail}</span></label>) : <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-950">No eligible replacement devices are currently available.</p>}</div><label className="mt-5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Effective date<input className={inputClass} type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} required /></label></section>
    </div> : null}

    {step === "sim" ? <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-700"><h2 className="font-semibold text-zinc-900 dark:text-zinc-50">What happens to the SIM?</h2><div className="mt-4 space-y-3">{currentSim ? <label className={`block cursor-pointer rounded-lg border p-3 ${simDisposition === "move_current" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 dark:border-zinc-700"}`}><input className="mr-2" type="radio" checked={simDisposition === "move_current"} onChange={() => setSimDisposition("move_current")} /><span className="font-medium">Move current SIM to replacement device</span><span className="mt-1 block pl-6 text-sm text-zinc-500">{currentSim.iccid} follows the installation; the old device becomes SIM-free.</span></label> : null}<label className={`block cursor-pointer rounded-lg border p-3 ${simDisposition === "select" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 dark:border-zinc-700"}`}><input className="mr-2" type="radio" checked={simDisposition === "select"} onChange={() => setSimDisposition("select")} /><span className="font-medium">Select another eligible SIM</span><span className="mt-1 block pl-6 text-sm text-zinc-500">Check allocation and provider compatibility before completion.</span></label><label className={`block cursor-pointer rounded-lg border p-3 ${simDisposition === "none" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 dark:border-zinc-700"}`}><input className="mr-2" type="radio" checked={simDisposition === "none"} onChange={() => setSimDisposition("none")} /><span className="font-medium">Proceed without a SIM</span></label></div></section><section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-700"><h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Eligible SIMs</h2>{simDisposition === "select" ? <div className="mt-4"><UnlinkedSimPicker inputName="selectedSimId" sims={availableSims} availabilityHint="Search by ICCID, provider label, or MSISDN; eligibility is checked again when this replacement is saved." onSelectionChange={setSelectedSim} /></div> : <p className="mt-4 text-sm text-zinc-500">Select “another eligible SIM” to choose a card.</p>}</section></div> : null}

    {step === "review" ? <div className="mt-6 rounded-xl border border-zinc-200 p-5 dark:border-zinc-700"><h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Review replacement</h2><dl className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-zinc-800"><div className="flex justify-between gap-4 py-2"><dt className="text-zinc-500">Replacement device</dt><dd className="font-medium text-right">{replacement?.label}</dd></div><div className="flex justify-between gap-4 py-2"><dt className="text-zinc-500">Effective date</dt><dd className="font-medium">{effectiveDate}</dd></div><div className="flex justify-between gap-4 py-2"><dt className="text-zinc-500">SIM handling</dt><dd className="font-medium text-right">{simDisposition === "move_current" ? `Move ${currentSim?.iccid ?? "current SIM"}` : simDisposition === "select" ? selectedSim?.iccid : "No SIM"}</dd></div></dl><fieldset className="mt-5"><legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Old hardware disposition</legend><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><label><input className="mr-2" type="radio" checked={oldHardwareDisposition === "in_stock"} onChange={() => setOldHardwareDisposition("in_stock")} />Return to stock</label><label><input className="mr-2" type="radio" checked={oldHardwareDisposition === "faulty_returned"} onChange={() => setOldHardwareDisposition("faulty_returned")} />Returned faulty</label><label><input className="mr-2" type="radio" checked={oldHardwareDisposition === "lost"} onChange={() => setOldHardwareDisposition("lost")} />Lost / unrecovered</label></div></fieldset><label className="mt-5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Reason (optional)<input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} /></label><p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">Before saving, eligibility is rechecked inside the transaction. Commercial service, billing, subscriptions, and provider settings are not changed.</p></div> : null}
    <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" onClick={() => step === "replacement" ? window.history.back() : setStep(step === "review" ? "sim" : "replacement")} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">{step === "replacement" ? "Cancel" : "← Back"}</button>{step === "review" ? <CommitButton /> : <button type="button" disabled={!canContinue} onClick={goNext} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Continue to {step === "replacement" ? "SIM handling" : "review"} →</button>}</div>
  </form>;
}
