"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import {
  recordCanonicalAssetLossAction,
  removeCanonicalServiceForVehicleSaleAction,
  transferCanonicalServiceAction,
  type CanonicalSubscriptionFormState,
} from "@/app/admin/subscriptions/canonical/actions";
import { currencyPrefix, displayDate, money } from "@/components/admin/canonical-subscription/format";
import {
  ArrowLeftIcon,
  CarIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  SimIcon,
  SwapIcon,
  TagIcon,
  WarningIcon,
} from "@/components/admin/canonical-subscription/icons";
import { ServiceActionDialog } from "@/components/admin/canonical-subscription/service-action-dialog";
import { ScheduleCanonicalDraftRateForm } from "@/components/admin/canonical-subscription-draft-forms";
import {
  CanonicalServiceHardwareReplacementForm,
  CanonicalServicePauseForm,
  CanonicalServiceResumeForm,
  Feedback,
  inputClass,
  useRefreshOnSuccess,
} from "@/components/admin/canonical-subscription-operations-form";
import { ASSET_LOSS_REASON_LABEL } from "@/lib/domain/asset-loss";
import type { ServiceActionAvailability } from "@/lib/domain/canonical-service-presentation";
import { SERVICE_PAUSE_DISPOSITION_LABEL } from "@/lib/domain/service-pause";

type Option = { id: string; label: string };
type Step = "edit" | "review";

const initialState: CanonicalSubscriptionFormState = {};

const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900";
const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:ring-offset-zinc-900";
const dangerButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900";

/**
 * A submitted form must never run twice. The button is disabled while pending, but two quick
 * activations can land before React re-renders, so the first submit also takes a lock that is only
 * released when the server answers with an error (a success keeps it locked for good).
 */
function useSingleSubmit(state: CanonicalSubscriptionFormState) {
  const locked = useRef(false);
  useEffect(() => {
    if (state.error) locked.current = false;
  }, [state]);
  return (event: FormEvent<HTMLFormElement>): boolean => {
    if (locked.current) {
      event.preventDefault();
      return false;
    }
    locked.current = true;
    return true;
  };
}

function calendarDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? displayDate(new Date(`${value}T00:00:00.000Z`), value) : value;
}

function ReviewList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-700">
      {rows.map(([term, detail]) => (
        <div key={term} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-3 py-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-zinc-500">{term}</dt>
          <dd className="min-w-0 break-words font-medium">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function SuccessPanel({ state, onClose }: { state: CanonicalSubscriptionFormState; onClose: () => void }) {
  return (
    <div>
      <Feedback state={state} />
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} autoFocus className={primaryButton}>Done</button>
      </div>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}

function Consequences({ items, tone = "neutral" }: { items: ReactNode[]; tone?: "neutral" | "danger" }) {
  return (
    <ul className={`mt-4 list-disc space-y-1 rounded-lg px-3 py-3 pl-7 text-sm ${tone === "danger" ? "bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200" : "bg-zinc-50 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"}`}>
      {items.map((item, index) => <li key={index}>{item}</li>)}
    </ul>
  );
}

// ---- Action rows ---------------------------------------------------------------------------------

function ActionRow({ id, icon, title, description, availability, tone = "neutral", onOpen }: {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  availability: ServiceActionAvailability;
  tone?: "neutral" | "warning";
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        id={id}
        type="button"
        onClick={onOpen}
        disabled={!availability.enabled}
        aria-haspopup="dialog"
        title={availability.enabled ? undefined : availability.reason ?? undefined}
        className="flex min-h-[4.25rem] w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:disabled:bg-zinc-950"
      >
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone === "warning" ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"} ${availability.enabled ? "" : "opacity-60"}`}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${availability.enabled ? "" : "text-zinc-500"}`}>{title}</span>
          <span className="mt-0.5 block text-xs text-zinc-500">{availability.enabled ? description : availability.reason}</span>
        </span>
        <ChevronRightIcon className={`size-4 shrink-0 text-zinc-400 ${availability.enabled ? "" : "opacity-40"}`} />
      </button>
    </li>
  );
}

// ---- Transfer ------------------------------------------------------------------------------------

function TransferDialog({ subscriptionId, itemId, serviceLabel, subscriptionLabel, currentAmount, currency, targets, fallbackFocusId, onClose }: {
  subscriptionId: string;
  itemId: string;
  serviceLabel: string;
  subscriptionLabel: string;
  currentAmount: string;
  currency: string;
  targets: Option[];
  fallbackFocusId: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(transferCanonicalServiceAction, initialState);
  useRefreshOnSuccess(state);
  const guard = useSingleSubmit(state);
  const [step, setStep] = useState<Step>("edit");
  const [values, setValues] = useState({ targetSubscriptionId: "", transferDate: "", agreedAmountPerCycle: currentAmount, classification: "negotiated", changeReason: "" });
  const set = (key: keyof typeof values) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const done = Boolean(state.message);
  const target = targets.find((option) => option.id === values.targetSubscriptionId);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step === "edit") {
      event.preventDefault();
      setStep("review");
      return;
    }
    guard(event);
  };

  return (
    <ServiceActionDialog
      title="Transfer to another subscription"
      description={step === "edit" ? `Move ${serviceLabel} to another subscription for this customer.` : "Review the transfer before confirming."}
      busy={pending}
      fallbackFocusId={fallbackFocusId}
      onClose={onClose}
    >
      {done ? <SuccessPanel state={state} onClose={onClose} /> : (
        <form action={action} onSubmit={onSubmit}>
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          <input type="hidden" name="subscriptionItemId" value={itemId} />
          <input type="hidden" name="targetSubscriptionId" value={values.targetSubscriptionId} />
          <input type="hidden" name="transferDate" value={values.transferDate} />
          <input type="hidden" name="agreedAmountPerCycle" value={values.agreedAmountPerCycle} />
          <input type="hidden" name="classification" value={values.classification} />
          <input type="hidden" name="changeReason" value={values.changeReason} />
          {step === "edit" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium sm:col-span-2">Transfer to<select required value={values.targetSubscriptionId} onChange={set("targetSubscriptionId")} className={inputClass}><option value="">Choose subscription</option>{targets.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                <label className="text-sm font-medium">Transfer date<input required type="date" value={values.transferDate} onChange={set("transferDate")} className={inputClass} /></label>
                <label className="text-sm font-medium">Successor cycle amount ({currencyPrefix(currency)})<input required inputMode="decimal" value={values.agreedAmountPerCycle} onChange={set("agreedAmountPerCycle")} className={inputClass} /></label>
                <label className="text-sm font-medium">Price type<select value={values.classification} onChange={set("classification")} className={inputClass}><option value="negotiated">Negotiated</option><option value="standard">Standard</option></select></label>
                <label className="text-sm font-medium">Commercial reason<input required value={values.changeReason} onChange={set("changeReason")} className={inputClass} placeholder="Approved service transfer" /></label>
              </div>
              <Footer>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button type="submit" className={primaryButton}>Review transfer</button>
              </Footer>
            </>
          ) : (
            <>
              <ReviewList rows={[
                ["Service", serviceLabel],
                ["From", subscriptionLabel],
                ["To", target?.label ?? "—"],
                ["Transfer date", calendarDate(values.transferDate)],
                ["Successor price", `${money(values.agreedAmountPerCycle, currency)} per cycle · ${values.classification === "standard" ? "Standard" : "Negotiated"}`],
                ["Reason", values.changeReason],
              ]} />
              <Consequences items={[
                "The service ends here on the transfer date and a successor service starts under the chosen subscription.",
                "Historical invoices, rates and assignments are not rewritten.",
              ]} />
              <Feedback state={state} />
              <Footer>
                <button type="button" onClick={() => setStep("edit")} disabled={pending} className={secondaryButton}><ArrowLeftIcon className="size-4" />Back</button>
                <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Transferring…" : "Confirm transfer"}</button>
              </Footer>
            </>
          )}
        </form>
      )}
    </ServiceActionDialog>
  );
}

// ---- Vehicle sold / remove tracker ---------------------------------------------------------------

function VehicleSoldDialog({ subscriptionId, itemId, assignmentId, serviceLabel, trackerLabel, billingEndsOn, fallbackFocusId, onClose }: {
  subscriptionId: string;
  itemId: string;
  assignmentId: string;
  serviceLabel: string;
  trackerLabel: string;
  billingEndsOn: string | null;
  fallbackFocusId: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(removeCanonicalServiceForVehicleSaleAction, initialState);
  useRefreshOnSuccess(state);
  const guard = useSingleSubmit(state);
  const [step, setStep] = useState<Step>("edit");
  const [values, setValues] = useState({ effectiveUntil: "", deviceDisposition: "returned", removalNote: "" });
  const set = (key: keyof typeof values) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const disposition = SERVICE_PAUSE_DISPOSITION_LABEL[values.deviceDisposition as keyof typeof SERVICE_PAUSE_DISPOSITION_LABEL] ?? values.deviceDisposition;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step === "edit") {
      event.preventDefault();
      setStep("review");
      return;
    }
    guard(event);
  };

  return (
    <ServiceActionDialog
      title="Vehicle sold / remove tracker"
      description={step === "edit" ? "End billing for this service and record the tracker’s return." : "Review before ending the service."}
      busy={pending}
      fallbackFocusId={fallbackFocusId}
      onClose={onClose}
    >
      {state.message ? <SuccessPanel state={state} onClose={onClose} /> : (
        <form action={action} onSubmit={onSubmit}>
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          <input type="hidden" name="subscriptionItemId" value={itemId} />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="effectiveUntil" value={values.effectiveUntil} />
          <input type="hidden" name="deviceDisposition" value={values.deviceDisposition} />
          <input type="hidden" name="removalNote" value={values.removalNote} />
          {step === "edit" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">End billing on<input required type="date" value={values.effectiveUntil} onChange={set("effectiveUntil")} className={inputClass} /></label>
                <label className="text-sm font-medium">Tracker disposition<select required value={values.deviceDisposition} onChange={set("deviceDisposition")} className={inputClass}>{Object.entries(SERVICE_PAUSE_DISPOSITION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm font-medium sm:col-span-2">Return details or notes (optional)<input value={values.removalNote} onChange={set("removalNote")} className={inputClass} placeholder="e.g. Vehicle 893 sold; tracker returned to office" /></label>
              </div>
              <Footer>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button type="submit" className={primaryButton}>Review</button>
              </Footer>
            </>
          ) : (
            <>
              <ReviewList rows={[
                ["Service", serviceLabel],
                ["Tracker", trackerLabel],
                ["Billing ends", calendarDate(values.effectiveUntil)],
                ["Tracker disposition", disposition],
                ...(values.removalNote.trim() ? [["Notes", values.removalNote.trim()] as [string, ReactNode]] : []),
              ]} />
              <Consequences items={[
                "Billing for this service stops on the chosen date and the tracker is recorded as removed.",
                "Historical billing and assignment records are not changed.",
                ...(billingEndsOn ? [`Billing is currently scheduled to end on ${calendarDate(billingEndsOn)}.`] : []),
              ]} />
              <Feedback state={state} />
              <Footer>
                <button type="button" onClick={() => setStep("edit")} disabled={pending} className={secondaryButton}><ArrowLeftIcon className="size-4" />Back</button>
                <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Recording…" : "End service and remove tracker"}</button>
              </Footer>
            </>
          )}
        </form>
      )}
    </ServiceActionDialog>
  );
}

// ---- Asset lost / unrecoverable ------------------------------------------------------------------

function AssetLostDialog({ subscriptionId, itemId, assignmentId, serviceLabel, trackerLabel, simLabel, fallbackFocusId, onClose }: {
  subscriptionId: string;
  itemId: string;
  assignmentId: string;
  serviceLabel: string;
  trackerLabel: string;
  simLabel: string | null;
  fallbackFocusId: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(recordCanonicalAssetLossAction, initialState);
  useRefreshOnSuccess(state);
  const guard = useSingleSubmit(state);
  const [step, setStep] = useState<Step>("edit");
  const [acknowledged, setAcknowledged] = useState(false);
  const [values, setValues] = useState({ lossDate: "", lossReason: "sank", lossNote: "" });
  const set = (key: keyof typeof values) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const reason = ASSET_LOSS_REASON_LABEL[values.lossReason as keyof typeof ASSET_LOSS_REASON_LABEL] ?? values.lossReason;
  const danger = step === "review" && !state.message;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step === "edit") {
      event.preventDefault();
      setStep("review");
      return;
    }
    if (!acknowledged) {
      event.preventDefault();
      return;
    }
    guard(event);
  };

  return (
    <ServiceActionDialog
      title="Asset lost / unrecoverable"
      description={step === "edit" ? "Record equipment loss and end service billing." : "This ends the service permanently. Confirm the details below."}
      tone={danger ? "danger" : "neutral"}
      busy={pending}
      fallbackFocusId={fallbackFocusId}
      onClose={onClose}
    >
      {state.message ? <SuccessPanel state={state} onClose={onClose} /> : (
        <form action={action} onSubmit={onSubmit}>
          <input type="hidden" name="subscriptionId" value={subscriptionId} />
          <input type="hidden" name="subscriptionItemId" value={itemId} />
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="lossDate" value={values.lossDate} />
          <input type="hidden" name="lossReason" value={values.lossReason} />
          <input type="hidden" name="lossNote" value={values.lossNote} />
          {step === "edit" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Date of loss (billing ends)<input required type="date" value={values.lossDate} onChange={set("lossDate")} className={inputClass} /></label>
                <label className="text-sm font-medium">What happened<select required value={values.lossReason} onChange={set("lossReason")} className={inputClass}>{Object.entries(ASSET_LOSS_REASON_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm font-medium sm:col-span-2">Note (optional)<input value={values.lossNote} onChange={set("lossNote")} className={inputClass} placeholder="e.g. Vessel sank off Rodney Bay; insurance claim filed" /></label>
              </div>
              <Footer>
                <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
                <button type="submit" className={primaryButton}>Review</button>
              </Footer>
            </>
          ) : (
            <>
              <ReviewList rows={[
                ["Service", serviceLabel],
                ["Tracker", trackerLabel],
                ["Date of loss", calendarDate(values.lossDate)],
                ["Reason", reason],
                ...(values.lossNote.trim() ? [["Note", values.lossNote.trim()] as [string, ReactNode]] : []),
              ]} />
              <Consequences tone="danger" items={[
                "Billing for this service ends on the date of loss and the installation is closed.",
                <span key="writeoff">{trackerLabel} is written off as <strong>lost</strong>.</span>,
                simLabel
                  ? <span key="sim">{simLabel} is unlinked from the tracker. Suspend or cancel it with the carrier if it should stop costing money.</span>
                  : "No SIM is linked to the tracker.",
                "Past invoices are not changed. The service cannot be resumed afterwards.",
              ]} />
              <label className="mt-4 flex items-start gap-3 text-sm">
                <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-red-700" />
                <span>I understand this permanently ends the service and writes off the tracker.</span>
              </label>
              <Feedback state={state} />
              <Footer>
                <button type="button" onClick={() => setStep("edit")} disabled={pending} className={secondaryButton}><ArrowLeftIcon className="size-4" />Back</button>
                <button type="submit" disabled={pending || !acknowledged} className={dangerButton}>{pending ? "Recording…" : "Record asset as lost"}</button>
              </Footer>
            </>
          )}
        </form>
      )}
    </ServiceActionDialog>
  );
}

// ---- The "Other service actions" list ------------------------------------------------------------

export type OtherServiceActionsProps = {
  subscriptionId: string;
  itemId: string;
  serviceLabel: string;
  subscriptionLabel: string;
  currentAmount: string;
  currency: string;
  transferTargets: Option[];
  /** The open assignment, when the service has a tracker that can be sold or lost. */
  assignment: { id: string; trackerLabel: string; simLabel: string | null } | null;
  billingEndsOn: string | null;
  availability: { transfer: ServiceActionAvailability; vehicleSold: ServiceActionAvailability; assetLost: ServiceActionAvailability };
};

export function OtherServiceActions(props: OtherServiceActionsProps) {
  const [active, setActive] = useState<null | "transfer" | "sold" | "lost">(null);
  const close = () => setActive(null);
  const ids = { transfer: `transfer-action-${props.itemId}`, sold: `sold-action-${props.itemId}`, lost: `lost-action-${props.itemId}` };
  const { assignment } = props;

  return (
    <>
      <ul className="space-y-2">
        <ActionRow id={ids.transfer} icon={<SwapIcon />} title="Transfer to another subscription" description="Move this service to another agreement" availability={props.availability.transfer} onOpen={() => setActive("transfer")} />
        <ActionRow id={ids.sold} icon={<CarIcon />} title="Vehicle sold / remove tracker" description="End billing and record the tracker’s return" availability={props.availability.vehicleSold} onOpen={() => setActive("sold")} />
        <ActionRow id={ids.lost} icon={<WarningIcon />} tone="warning" title="Asset lost / unrecoverable" description="Record loss and end billing for this service" availability={props.availability.assetLost} onOpen={() => setActive("lost")} />
      </ul>
      {active === "transfer" ? (
        <TransferDialog subscriptionId={props.subscriptionId} itemId={props.itemId} serviceLabel={props.serviceLabel} subscriptionLabel={props.subscriptionLabel} currentAmount={props.currentAmount} currency={props.currency} targets={props.transferTargets} fallbackFocusId={ids.transfer} onClose={close} />
      ) : null}
      {active === "sold" && assignment ? (
        <VehicleSoldDialog subscriptionId={props.subscriptionId} itemId={props.itemId} assignmentId={assignment.id} serviceLabel={props.serviceLabel} trackerLabel={assignment.trackerLabel} billingEndsOn={props.billingEndsOn} fallbackFocusId={ids.sold} onClose={close} />
      ) : null}
      {active === "lost" && assignment ? (
        <AssetLostDialog subscriptionId={props.subscriptionId} itemId={props.itemId} assignmentId={assignment.id} serviceLabel={props.serviceLabel} trackerLabel={assignment.trackerLabel} simLabel={assignment.simLabel} fallbackFocusId={ids.lost} onClose={close} />
      ) : null}
    </>
  );
}

// ---- Quick actions: replace tracker, swap SIM, manage rate ---------------------------------------

function ReplaceTrackerDialog({ subscriptionId, itemId, deviceId, trackerLabel, replacementAssignments, fallbackFocusId, onClose }: {
  subscriptionId: string;
  itemId: string;
  deviceId: string;
  trackerLabel: string;
  replacementAssignments: Option[];
  fallbackFocusId: string;
  onClose: () => void;
}) {
  return (
    <ServiceActionDialog title="Replace tracker" description={`Choose how to replace ${trackerLabel}. Commercial terms and billing dates are not changed.`} size="lg" fallbackFocusId={fallbackFocusId} onClose={onClose}>
      <section aria-labelledby={`replace-stock-${itemId}`} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 id={`replace-stock-${itemId}`} className="text-sm font-semibold">Replace with a tracker from stock</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">A guided workflow: choose the replacement, decide what happens to the SIM and the old tracker, then review.</p>
        <Link href={`/admin/devices/${deviceId}/replace`} className={`${primaryButton} mt-3 w-full sm:w-auto`}><RefreshIcon className="size-4" />Start guided replacement</Link>
      </section>
      <section aria-labelledby={`replace-existing-${itemId}`} className="mt-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 id={`replace-existing-${itemId}`} className="text-sm font-semibold">Use an existing unlinked installation</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Move an installation that is not yet billed under any service onto this one. The previous assignment stays in history and billing is unchanged.</p>
        <CanonicalServiceHardwareReplacementForm subscriptionId={subscriptionId} subscriptionItemId={itemId} assignments={replacementAssignments} />
      </section>
      <Footer>
        <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
      </Footer>
    </ServiceActionDialog>
  );
}

function ManageRateDialog({ subscriptionId, itemId, serviceLabel, nextBillingDate, currentAmount, currency, currentRateText, scheduledRateText, fallbackFocusId, onClose }: {
  subscriptionId: string;
  itemId: string;
  serviceLabel: string;
  nextBillingDate: string;
  currentAmount: string;
  currency: string;
  currentRateText: string;
  scheduledRateText: string | null;
  fallbackFocusId: string;
  onClose: () => void;
}) {
  return (
    <ServiceActionDialog title="Manage rate" description={`Schedule a price change for ${serviceLabel}. Existing invoices and price history are preserved.`} size="lg" fallbackFocusId={fallbackFocusId} onClose={onClose}>
      <p className="mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950">
        <span className="text-zinc-500">Current rate </span><span className="font-semibold tabular-nums">{currentRateText}</span>
        {scheduledRateText ? <span className="block text-zinc-600 dark:text-zinc-400">Already scheduled: {scheduledRateText}</span> : null}
      </p>
      <ScheduleCanonicalDraftRateForm itemId={itemId} subscriptionId={subscriptionId} nextBillingDate={nextBillingDate} currentAmount={currentAmount} currencyLabel={currencyPrefix(currency)} />
      <Footer>
        <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
      </Footer>
    </ServiceActionDialog>
  );
}

export type ServiceQuickActionsProps = {
  subscriptionId: string;
  itemId: string;
  serviceLabel: string;
  device: { id: string; label: string } | null;
  replacementAssignments: Option[];
  nextBillingDate: string;
  currentAmount: string;
  currency: string;
  currentRateText: string;
  scheduledRateText: string | null;
  availability: { replaceTracker: ServiceActionAvailability; swapSim: ServiceActionAvailability; manageRate: ServiceActionAvailability };
};

export function ServiceQuickActions(props: ServiceQuickActionsProps) {
  const [active, setActive] = useState<null | "replace" | "rate">(null);
  const close = () => setActive(null);
  const { availability, device } = props;
  const replaceId = `replace-action-${props.itemId}`;
  const rateId = `rate-action-${props.itemId}`;
  const reasonsId = `quick-action-reasons-${props.itemId}`;
  const reasons = [...new Set([availability.replaceTracker.reason, availability.swapSim.reason, availability.manageRate.reason].filter((reason): reason is string => Boolean(reason)))];
  const canReplace = availability.replaceTracker.enabled && device;
  const canSwap = availability.swapSim.enabled && device;
  const describedBy = reasons.length ? reasonsId : undefined;

  return (
    <div>
      <h3 className="text-sm font-semibold">Quick actions</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {canReplace && props.replacementAssignments.length === 0 ? (
          <Link id={replaceId} href={`/admin/devices/${device.id}/replace`} className={primaryButton}><RefreshIcon className="size-4" />Replace tracker</Link>
        ) : (
          <button id={replaceId} type="button" disabled={!canReplace} aria-haspopup={canReplace ? "dialog" : undefined} aria-describedby={describedBy} onClick={() => setActive("replace")} className={primaryButton}><RefreshIcon className="size-4" />Replace tracker</button>
        )}
        {canSwap ? (
          <Link href={`/admin/devices/${device.id}/swap-sim`} className={secondaryButton}><SimIcon className="size-4" />Swap SIM</Link>
        ) : (
          <button type="button" disabled aria-describedby={describedBy} className={secondaryButton}><SimIcon className="size-4" />Swap SIM</button>
        )}
        <button id={rateId} type="button" disabled={!availability.manageRate.enabled} aria-haspopup="dialog" aria-describedby={describedBy} onClick={() => setActive("rate")} className={secondaryButton}><TagIcon className="size-4" />Manage rate</button>
      </div>
      {reasons.length ? (
        <ul id={reasonsId} className="mt-2 space-y-1 text-xs text-zinc-500">
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      ) : null}
      {active === "replace" && device ? (
        <ReplaceTrackerDialog subscriptionId={props.subscriptionId} itemId={props.itemId} deviceId={device.id} trackerLabel={device.label} replacementAssignments={props.replacementAssignments} fallbackFocusId={replaceId} onClose={close} />
      ) : null}
      {active === "rate" ? (
        <ManageRateDialog subscriptionId={props.subscriptionId} itemId={props.itemId} serviceLabel={props.serviceLabel} nextBillingDate={props.nextBillingDate} currentAmount={props.currentAmount} currency={props.currency} currentRateText={props.currentRateText} scheduledRateText={props.scheduledRateText} fallbackFocusId={rateId} onClose={close} />
      ) : null}
    </div>
  );
}

// ---- Pause / resume, next to the status ----------------------------------------------------------

export function ServiceStatusControl({ subscriptionId, itemId, assignmentId, trackerLabel, billedByStripe, pause, resume }: {
  subscriptionId: string;
  itemId: string;
  assignmentId: string | null;
  trackerLabel: string;
  billedByStripe: boolean;
  pause: ServiceActionAvailability;
  resume: ServiceActionAvailability;
}) {
  const [active, setActive] = useState<null | "pause" | "resume">(null);
  const close = () => setActive(null);
  const buttonId = `status-action-${itemId}`;
  if (!assignmentId) return null;
  const canPause = pause.enabled;
  const canResume = resume.enabled;

  return (
    <>
      {canPause || canResume ? (
        <button
          id={buttonId}
          type="button"
          onClick={() => setActive(canResume ? "resume" : "pause")}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {canResume ? <><PlayIcon className="size-4" />Resume service</> : <><PauseIcon className="size-4" />Pause service</>}
        </button>
      ) : null}
      {active === "pause" ? (
        <ServiceActionDialog title="Pause service" description="Use for a temporary break. The service stays on the subscription." size="lg" fallbackFocusId={buttonId} onClose={close}>
          <CanonicalServicePauseForm subscriptionId={subscriptionId} subscriptionItemId={itemId} assignmentId={assignmentId} />
          <Footer><button type="button" onClick={close} className={secondaryButton}>Close</button></Footer>
        </ServiceActionDialog>
      ) : null}
      {active === "resume" ? (
        <ServiceActionDialog title="Resume service" fallbackFocusId={buttonId} onClose={close}>
          <CanonicalServiceResumeForm subscriptionId={subscriptionId} subscriptionItemId={itemId} assignmentId={assignmentId} deviceLabel={trackerLabel} billedByStripe={billedByStripe} />
          <Footer><button type="button" onClick={close} className={secondaryButton}>Close</button></Footer>
        </ServiceActionDialog>
      ) : null}
    </>
  );
}
