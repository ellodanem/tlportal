import Link from "next/link";

import { cycleUnit, displayDate, money } from "@/components/admin/canonical-subscription/format";
import { ExternalIcon } from "@/components/admin/canonical-subscription/icons";
import { formatHistoryDate, type ServiceHistoryRow, type ServiceHistorySource } from "@/lib/domain/canonical-service-history";
import { subscriptionServicePath } from "@/lib/domain/canonical-subscription-navigation";
import type { SubscriptionDetail } from "@/lib/admin/canonical-subscription-page-data";

type Item = SubscriptionDetail["items"][number];

const cardClass = "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
const RECENT_LIMIT = 5;

const SOURCE_LABEL: Record<ServiceHistorySource, string> = {
  pricing: "Pricing",
  assignment: "Hardware",
  lifecycle: "Service",
  audit: "Audit log",
};

function HistoryTable({ rows, showSource = false, caption }: { rows: ServiceHistoryRow[]; showSource?: boolean; caption: string }) {
  return (
    <>
      <ul className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
        {rows.map((row) => (
          <li key={row.id} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">{row.event}</span>
              <time dateTime={row.date.toISOString().slice(0, 10)} className="shrink-0 text-xs text-zinc-500">{formatHistoryDate(row.date)}</time>
            </div>
            {row.details ? <p className="mt-0.5 break-words text-sm text-zinc-600 dark:text-zinc-400">{row.details}</p> : null}
            {showSource ? <p className="mt-1 text-xs text-zinc-500">{SOURCE_LABEL[row.source]}</p> : null}
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
          <tr>
            <th scope="col" className="w-40 rounded-l-lg px-4 py-2.5">Date</th>
            <th scope="col" className="w-64 px-4 py-2.5">Event</th>
            <th scope="col" className={`px-4 py-2.5 ${showSource ? "" : "rounded-r-lg"}`}>Details</th>
            {showSource ? <th scope="col" className="w-28 rounded-r-lg px-4 py-2.5">Record</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300"><time dateTime={row.date.toISOString().slice(0, 10)}>{formatHistoryDate(row.date)}</time></td>
              <td className="px-4 py-3 font-semibold">{row.event}</td>
              <td className="break-words px-4 py-3 text-zinc-600 dark:text-zinc-400">{row.details || "—"}</td>
              {showSource ? <td className="px-4 py-3 text-xs text-zinc-500">{SOURCE_LABEL[row.source]}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The few most recent events on the service screen, with a route to the complete history. */
export function ServiceHistorySummary({ subscriptionId, itemId, serviceLabel, rows }: { subscriptionId: string; itemId: string; serviceLabel: string; rows: ServiceHistoryRow[] }) {
  const recent = rows.slice(0, RECENT_LIMIT);
  return (
    <section aria-labelledby="service-history-heading" className={`${cardClass} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="service-history-heading" className="text-base font-semibold">Service history</h3>
          <p className="mt-0.5 text-sm text-zinc-500">Assignment, pricing and key changes for {serviceLabel}.</p>
        </div>
        <Link href={`${subscriptionServicePath(subscriptionId, itemId)}/history`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
          Full history<ExternalIcon className="size-4" />
        </Link>
      </div>
      <div className="mt-3">
        {recent.length ? (
          <HistoryTable rows={recent} caption={`Recent history for ${serviceLabel}`} />
        ) : <p className="py-6 text-center text-sm text-zinc-500">No history has been recorded for this service yet.</p>}
        {rows.length > recent.length ? <p className="mt-2 text-xs text-zinc-500">Showing the {recent.length} most recent of {rows.length} events.</p> : null}
      </div>
    </section>
  );
}

/**
 * Every record for one service. The unified timeline is a convenience view; the pricing and the
 * hardware-assignment records below it are the untouched sources, with their effective dates.
 */
export function ServiceFullHistory({ item, rows }: { item: Item; rows: ServiceHistoryRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="timeline-heading" className={`${cardClass} p-5`}>
        <h3 id="timeline-heading" className="text-base font-semibold">All events ({rows.length})</h3>
        <p className="mt-0.5 text-sm text-zinc-500">Newest first. Each event comes from the pricing, hardware, service or audit record named in the last column.</p>
        <div className="mt-3">
          {rows.length ? <HistoryTable rows={rows} showSource caption="Complete service history" /> : <p className="py-6 text-center text-sm text-zinc-500">No history has been recorded for this service yet.</p>}
        </div>
      </section>

      <section aria-labelledby="service-records-heading" className={`${cardClass} p-5`}>
        <h3 id="service-records-heading" className="text-base font-semibold">Price and hardware history</h3>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Price history</h4>
            {item.rates.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {item.rates.map((entry) => (
                  <li key={entry.id} className="flex flex-col justify-between gap-1 rounded-lg bg-zinc-50 px-3 py-2 sm:flex-row dark:bg-zinc-950">
                    <span className="min-w-0 break-words font-medium tabular-nums">
                      {money(entry.agreedAmountPerCycle.toString(), entry.currency)} / {cycleUnit(entry.billingIntervalMonths)} · <span className="capitalize">{entry.classification}</span>
                      {entry.changeReason ? <span className="block text-xs font-normal text-zinc-500">{entry.changeReason}</span> : null}
                    </span>
                    <span className="shrink-0 text-zinc-500">{displayDate(entry.effectiveFrom)} to {displayDate(entry.effectiveUntil, "open")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-zinc-500">No price history.</p>}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Hardware assignments</h4>
            {item.serviceAssignments.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {item.serviceAssignments.map((assignment) => (
                  <li key={assignment.id} className="flex flex-col justify-between gap-1 sm:flex-row">
                    <span className="min-w-0 break-words">
                      {assignment.device.label?.trim() || assignment.device.deviceModel.name} · <span className="capitalize text-zinc-500">{assignment.status.replaceAll("_", " ")}</span>
                      <span className="block break-all text-xs text-zinc-500">{assignment.device.imei}{assignment.simCard ? ` · SIM ${assignment.simCard.iccid}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-zinc-500">{displayDate(assignment.startDate, "unknown")} to {displayDate(assignment.endDate, "present")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-zinc-500">No linked device history.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
