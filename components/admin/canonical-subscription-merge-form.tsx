"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { mergeCanonicalSubscriptionsAction, retireEmptiedCanonicalSubscriptionsAction, type CanonicalSubscriptionFormState } from "@/app/admin/subscriptions/canonical/actions";
import { cadenceLabel, formatCents } from "@/lib/domain/subscription-proration";

export type MergeFormCandidate = {
  id: string;
  name: string;
  lifecycleStatus: string;
  billingIntervalMonths: number | null;
  currency: string;
  /** YYYY-MM-DD */
  nextBillingDate: string | null;
  /** Subscriptions with the same key have identical terms. */
  key: string;
  blockers: string[];
  liveServiceCount: number;
  cycleTotalCents: number;
};

const initialState: CanonicalSubscriptionFormState = {};
const cardClass = "rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900";
const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

function displayDate(value: string | null) {
  if (!value) return "No renewal date";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

/** Turns a compatibility key (interval|currency|renewal|collection|lifecycle|grace) into readable terms. */
function describeTerms(key: string) {
  const [interval, currency, renewal, collection, lifecycle, grace] = key.split("|");
  const months = Number(interval);
  const cycle = Number.isFinite(months) ? cadenceLabel(months) : "no cycle";
  return [cycle, currency, renewal === "none" ? "no renewal date" : displayDate(renewal), collection.replaceAll("_", " "), lifecycle.replaceAll("_", " "), `${grace} grace days`].join(" · ");
}

function money(cents: number, currency: string) {
  return `${currency === "XCD" ? "EC$" : `${currency} `}${formatCents(cents)}`;
}

export function RetireEmptiedSubscriptionsForm({
  customerId,
  count,
}: {
  customerId: string;
  count: number;
}) {
  const [state, action, pending] = useActionState(retireEmptiedCanonicalSubscriptionsAction, initialState);
  const router = useRouter();
  useEffect(() => { if (state.message) router.refresh(); }, [router, state.message]);
  return (
    <form action={action} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-amber-950 dark:text-amber-100">
        <span className="font-semibold">{count} empty agreement{count === 1 ? "" : "s"}</span>
        {count === 1 ? " has" : " have"} no live services. Merge cannot combine them: they have nothing to move, and different renewal dates stay separate agreements. Closing them stops future invoices and hides them from the active list.
      </p>
      <button disabled={pending || Boolean(state.message)} className="mt-3 min-h-11 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Closing…" : count === 1 ? "Close empty agreement" : `Close ${count} empty agreements`}
      </button>
      {state.error ? <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{state.error}</p> : null}
      {state.message ? <p role="status" className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">{state.message}</p> : null}
    </form>
  );
}

export function CanonicalSubscriptionMergeForm({ customerId, customerLabel, candidates }: { customerId: string; customerLabel: string; candidates: MergeFormCandidate[] }) {
  const [state, action, pending] = useActionState(mergeCanonicalSubscriptionsAction, initialState);
  const router = useRouter();
  useEffect(() => { if (state.next) router.push(state.next); }, [router, state.next]);

  const mergeable = useMemo(() => candidates.filter((candidate) => candidate.blockers.length === 0), [candidates]);
  const blocked = candidates.filter((candidate) => candidate.blockers.length > 0);
  const groups = useMemo(() => {
    const byKey = new Map<string, MergeFormCandidate[]>();
    for (const candidate of mergeable) byKey.set(candidate.key, [...(byKey.get(candidate.key) ?? []), candidate]);
    return [...byKey.values()].filter((group) => group.length > 1).sort((left, right) => right.length - left.length);
  }, [mergeable]);

  const [groupIndex, setGroupIndex] = useState(0);
  const group = groups[groupIndex] ?? null;
  const [targetId, setTargetId] = useState(() => groups[0]?.[0]?.id ?? "");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");

  function chooseGroup(index: number) {
    setGroupIndex(index);
    setTargetId(groups[index]?.[0]?.id ?? "");
    setExcluded(new Set());
  }

  const emptied = candidates.filter((candidate) => candidate.liveServiceCount === 0);

  if (!group) {
    return (
      <div className={cardClass}>
        <h2 className="text-lg font-semibold">Nothing to merge</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{customerLabel} has no two subscriptions with identical terms (same cycle, renewal date, collection method, status and grace period) that have never been billed.</p>
        {emptied.length ? <div className="mt-4"><RetireEmptiedSubscriptionsForm customerId={customerId} count={emptied.length} /></div> : null}
        {candidates.length ? (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Terms compared</h3>
            <p className="mt-1 text-xs text-zinc-500">Cycle · currency · renewal · collection · status · grace days. Subscriptions must match on every one.</p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              {candidates.map((candidate) => <li key={candidate.id}><span className="font-medium">{candidate.name}</span> — {describeTerms(candidate.key)}{candidate.blockers.length ? ` · ${candidate.blockers[0]}` : ""}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  const effectiveTarget = group.some((candidate) => candidate.id === targetId) ? targetId : group[0].id;
  const sources = group.filter((candidate) => candidate.id !== effectiveTarget && !excluded.has(candidate.id));
  const target = group.find((candidate) => candidate.id === effectiveTarget)!;
  const merged = [target, ...sources];
  const services = merged.reduce((sum, candidate) => sum + candidate.liveServiceCount, 0);
  const totalCents = merged.reduce((sum, candidate) => sum + candidate.cycleTotalCents, 0);
  const unit = target.billingIntervalMonths === 12 ? "year" : target.billingIntervalMonths === 1 ? "month" : `${target.billingIntervalMonths ?? ""} months`;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="targetId" value={effectiveTarget} />
      {sources.map((candidate) => <input key={candidate.id} type="hidden" name="sourceIds" value={candidate.id} />)}

      {groups.length > 1 ? (
        <section className={cardClass}>
          <h2 className="text-lg font-semibold">Which subscriptions?</h2>
          <p className="mt-1 text-sm text-zinc-500">Only subscriptions with identical terms can be merged. Pick a set.</p>
          <div className="mt-3 grid gap-2">
            {groups.map((candidates, index) => (
              <label key={candidates[0].key} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${index === groupIndex ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-700"}`}>
                <input type="radio" checked={index === groupIndex} onChange={() => chooseGroup(index)} className="mt-1" />
                <span>{candidates.length} × {cadenceLabel(candidates[0].billingIntervalMonths ?? 12)} · renews {displayDate(candidates[0].nextBillingDate)} · {candidates[0].lifecycleStatus.replaceAll("_", " ")}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section className={cardClass}>
        <h2 className="text-lg font-semibold">Merge into one subscription</h2>
        <p className="mt-1 text-sm text-zinc-500">The subscription you keep is the one whose history carries on. The others are closed once their services move across.</p>
        <ul className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {group.map((candidate) => {
            const isTarget = candidate.id === effectiveTarget;
            return (
              <li key={candidate.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{candidate.name}</p>
                  <p className="text-xs text-zinc-500">{candidate.liveServiceCount} service{candidate.liveServiceCount === 1 ? "" : "s"} · {money(candidate.cycleTotalCents, candidate.currency)} per {unit} · renews {displayDate(candidate.nextBillingDate)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex min-h-11 items-center gap-2"><input type="radio" name="keep" checked={isTarget} onChange={() => { setTargetId(candidate.id); setExcluded((current) => { const next = new Set(current); next.delete(candidate.id); return next; }); }} /> Keep this one</label>
                  {isTarget ? <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Receives the services</span> : (
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" checked={!excluded.has(candidate.id)} onChange={(event) => setExcluded((current) => { const next = new Set(current); if (event.target.checked) next.delete(candidate.id); else next.add(candidate.id); return next; })} /> Merge into it
                    </label>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <h2 className="text-lg font-semibold">Result</h2>
        <p className="mt-2 text-sm">
          One subscription with <strong>{services} service{services === 1 ? "" : "s"}</strong>, <strong className="tabular-nums">{money(totalCents, target.currency)}</strong> per {unit}, renewing <strong>{displayDate(target.nextBillingDate)}</strong>. {sources.length ? `${sources.length} other subscription${sources.length === 1 ? "" : "s"} will be closed.` : "Select at least one subscription to merge."}
        </p>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Services keep their prices, devices and history. On the renewal date the customer receives one invoice with a line per service instead of {merged.length} separate invoices.</p>
      </section>

      <section className={cardClass}>
        <label className="text-sm font-medium">Reason
          <input name="reason" required minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Five vehicles migrated separately; one invoice preferred" className={inputClass} />
        </label>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input type="checkbox" name="confirm" value="yes" required className="mt-1 size-4" />
          <span>Nothing has been invoiced or charged from these subscriptions. Their recurring schedules will be ended and the services invoiced from the kept subscription.</span>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={pending || !sources.length || Boolean(state.next)} className="min-h-11 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Merging…" : `Merge ${merged.length} into one subscription`}</button>
          {state.error ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{state.error}</p> : null}
          {state.message ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{state.message}</p> : null}
        </div>
      </section>

      {blocked.length ? <section className={cardClass}><BlockedList blocked={blocked} /></section> : null}
    </form>
  );
}

function BlockedList({ blocked }: { blocked: MergeFormCandidate[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">Not available to merge</h3>
      <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
        {blocked.map((candidate) => <li key={candidate.id}><span className="font-medium">{candidate.name}</span> — {candidate.blockers[0]}</li>)}
      </ul>
    </div>
  );
}
