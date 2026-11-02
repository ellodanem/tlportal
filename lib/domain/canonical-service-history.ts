/**
 * One chronological view of a subscription service for staff. It is assembled, read-only, from the
 * records that already exist: effective-dated rates (pricing), hardware assignments, the service's
 * own lifecycle dates, and the operational audit events written by the existing operations. The
 * source records are never merged or rewritten; each row names its `source` so pricing history and
 * assignment history stay distinguishable.
 */

import { ASSET_LOSS_REASON_LABEL, type AssetLossReason } from "@/lib/domain/asset-loss";
import { SERVICE_PAUSE_DISPOSITION_LABEL, SERVICE_PAUSE_REASON_LABEL, type ServicePauseDeviceDisposition } from "@/lib/domain/service-pause";
import { formatExpenseAmount } from "@/lib/domain/expenses";
import type { ServiceAssignmentPauseReason } from "@prisma/client";

export type ServiceHistorySource = "pricing" | "assignment" | "lifecycle" | "audit";

export type ServiceHistoryRow = {
  id: string;
  date: Date;
  source: ServiceHistorySource;
  event: string;
  details: string;
};

type Decimalish = { toString(): string };

export type ServiceHistoryItem = {
  id: string;
  label: string | null;
  status: string;
  serviceActivatedDate: Date | null;
  billingEffectiveFrom: Date | null;
  billingEffectiveUntil: Date | null;
  predecessorItemId: string | null;
  successorItem?: { id: string } | null;
  rates: {
    id: string;
    agreedAmountPerCycle: Decimalish;
    currency: string;
    billingIntervalMonths: number;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    classification: string;
    changeReason: string | null;
  }[];
  serviceAssignments: {
    id: string;
    startDate: Date | null;
    endDate: Date | null;
    status: string;
    createdAt?: Date;
    simCard?: { iccid: string; label: string | null } | null;
    device: { label: string | null; imei: string; deviceModel: { name: string } };
  }[];
};

/** A persisted operational event, already narrowed to this service by the loader. */
export type ServiceAuditEvent = {
  id: string;
  occurredAt: Date;
  category: string;
  deviceId: string | null;
  payload: unknown;
};

export type ServiceHistoryInput = {
  item: ServiceHistoryItem;
  events?: readonly ServiceAuditEvent[];
  /** SIM id → printable identifier, for SIM change events that only store ids. */
  simLabels?: Readonly<Record<string, string>>;
  /** Now, injectable for tests. */
  today?: Date;
};

/** Audit categories that the history surfaces; everything else is covered by the source records. */
export const SERVICE_HISTORY_AUDIT_CATEGORIES = [
  "sim.swapped",
  "sim.unlinked",
  "subscription.service_paused",
  "subscription.service_resumed",
  "subscription.vehicle_sold_tracker_removed",
  "subscription.asset_lost",
] as const;

const DAY_MS = 86_400_000;
const utcDay = (value: Date) => Math.floor(value.getTime() / DAY_MS);

export function formatHistoryDate(value: Date): string {
  return value.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}

function cycleWord(months: number): string {
  if (months === 1) return "month";
  if (months === 3) return "quarter";
  if (months === 6) return "6 months";
  if (months === 12) return "year";
  return "cycle";
}

function deviceName(device: { label: string | null; imei: string; deviceModel: { name: string } }): string {
  return device.label?.trim() || device.deviceModel.name;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isoDate(value: unknown): Date | null {
  const text = str(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dispositionText(value: unknown): string | null {
  const key = str(value) as ServicePauseDeviceDisposition | null;
  if (!key) return null;
  const label = SERVICE_PAUSE_DISPOSITION_LABEL[key];
  return label ? label.split(" (")[0].toLowerCase() : null;
}

/** Builds the newest-first history. Pure: the same inputs always give the same rows. */
export function buildServiceHistory({ item, events = [], simLabels = {}, today = new Date() }: ServiceHistoryInput): ServiceHistoryRow[] {
  const rows: ServiceHistoryRow[] = [];
  const add = (row: ServiceHistoryRow) => rows.push(row);

  const lossEvents = events.filter((event) => event.category === "subscription.asset_lost");
  const saleEvents = events.filter((event) => event.category === "subscription.vehicle_sold_tracker_removed");
  // A loss or sale already reports its billing end and tracker removal, so those plain rows are folded in.
  const endExplainedByEvent = lossEvents.length > 0 || saleEvents.length > 0;

  // --- Lifecycle -----------------------------------------------------------------------------
  const started = item.serviceActivatedDate ?? item.billingEffectiveFrom;
  if (started) {
    const billsFrom = item.billingEffectiveFrom && item.serviceActivatedDate && utcDay(item.billingEffectiveFrom) !== utcDay(item.serviceActivatedDate)
      ? `Billing from ${formatHistoryDate(item.billingEffectiveFrom)}`
      : item.billingEffectiveFrom && !item.serviceActivatedDate ? "Billing starts" : "";
    add({
      id: `lifecycle-start-${item.id}`,
      date: started,
      source: "lifecycle",
      event: item.predecessorItemId ? "Transferred in" : "Service started",
      details: item.predecessorItemId
        ? ["Continues a service from another subscription", billsFrom].filter(Boolean).join(" · ")
        : billsFrom,
    });
  }
  if (item.billingEffectiveUntil && !endExplainedByEvent) {
    const past = utcDay(item.billingEffectiveUntil) <= utcDay(today);
    const transferred = Boolean(item.successorItem);
    add({
      id: `lifecycle-end-${item.id}`,
      date: item.billingEffectiveUntil,
      source: "lifecycle",
      event: transferred ? "Transferred out" : past ? "Billing ended" : "Billing end scheduled",
      details: transferred ? "Continues as a new service on another subscription" : item.status === "canceled" ? "Service canceled" : item.status === "ended" ? "Service ended" : "",
    });
  }

  // --- Pricing (effective-dated rates) -------------------------------------------------------
  const rates = [...item.rates].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  rates.forEach((rate, index) => {
    const classification = rate.classification === "negotiated" ? "Negotiated rate" : "Standard rate";
    const amount = `${formatExpenseAmount(Number(rate.agreedAmountPerCycle.toString()), rate.currency)} / ${cycleWord(rate.billingIntervalMonths)}`;
    const reason = rate.changeReason?.trim();
    const scheduled = utcDay(rate.effectiveFrom) > utcDay(today);
    add({
      id: `rate-${rate.id}`,
      date: rate.effectiveFrom,
      source: "pricing",
      event: index === 0 ? "Price set" : scheduled ? "Price change scheduled" : "Price updated",
      details: [amount, classification, reason && reason.toLowerCase() !== classification.toLowerCase() ? reason : null].filter(Boolean).join(" · "),
    });
  });

  // --- Hardware assignments ------------------------------------------------------------------
  const assignments = [...item.serviceAssignments]
    .map((assignment) => ({ assignment, date: assignment.startDate ?? assignment.createdAt ?? null }))
    .filter((entry): entry is { assignment: ServiceHistoryItem["serviceAssignments"][number]; date: Date } => entry.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  assignments.forEach(({ assignment, date }, index) => {
    const name = deviceName(assignment.device);
    const sim = assignment.simCard ? `SIM ${assignment.simCard.iccid}` : null;
    const previous = index > 0 ? deviceName(assignments[index - 1].assignment.device) : null;
    add({
      id: `assignment-start-${assignment.id}`,
      date,
      source: "assignment",
      event: previous ? "Tracker replaced" : "Tracker assigned",
      details: [previous ? `${previous} → ${name}` : name, assignment.device.imei, sim].filter(Boolean).join(" · "),
    });
    const last = index === assignments.length - 1;
    if (last && assignment.endDate && !lossEvents.length && !saleEvents.length) {
      add({
        id: `assignment-end-${assignment.id}`,
        date: assignment.endDate,
        source: "assignment",
        event: "Tracker removed",
        details: [name, assignment.device.imei].join(" · "),
      });
    }
  });

  // --- Audit events --------------------------------------------------------------------------
  for (const event of events) {
    const payload = record(event.payload);
    switch (event.category) {
      case "sim.swapped": {
        const from = str(payload.previousSimId);
        const to = str(payload.nextSimId);
        const fromLabel = from ? simLabels[from] ?? "previous SIM" : "no SIM";
        const toLabel = to ? simLabels[to] ?? "new SIM" : "no SIM";
        add({ id: `event-${event.id}`, date: event.occurredAt, source: "audit", event: "SIM changed", details: `${fromLabel} → ${toLabel}` });
        break;
      }
      case "sim.unlinked": {
        const from = str(payload.previousSimId);
        add({ id: `event-${event.id}`, date: event.occurredAt, source: "audit", event: "SIM unlinked", details: from ? simLabels[from] ?? "SIM removed from tracker" : "SIM removed from tracker" });
        break;
      }
      case "subscription.service_paused": {
        const reason = SERVICE_PAUSE_REASON_LABEL[str(payload.reason) as ServiceAssignmentPauseReason];
        const disposition = dispositionText(payload.deviceDisposition);
        add({ id: `event-${event.id}`, date: event.occurredAt, source: "audit", event: "Service paused", details: [reason, disposition ? `Tracker ${disposition}` : null].filter(Boolean).join(" · ") });
        break;
      }
      case "subscription.service_resumed":
        add({ id: `event-${event.id}`, date: event.occurredAt, source: "audit", event: "Service resumed", details: "Tracker assigned again" });
        break;
      case "subscription.vehicle_sold_tracker_removed": {
        const until = isoDate(payload.effectiveUntil);
        const disposition = dispositionText(payload.deviceDisposition);
        add({
          id: `event-${event.id}`,
          date: until ?? event.occurredAt,
          source: "audit",
          event: "Vehicle sold, tracker removed",
          details: [until ? `Billing ends ${formatHistoryDate(until)}` : null, disposition ? `Tracker ${disposition}` : null].filter(Boolean).join(" · "),
        });
        break;
      }
      case "subscription.asset_lost": {
        const lossDate = isoDate(payload.lossDate);
        const reason = ASSET_LOSS_REASON_LABEL[str(payload.reason) as AssetLossReason];
        add({
          id: `event-${event.id}`,
          date: lossDate ?? event.occurredAt,
          source: "audit",
          event: "Asset lost",
          details: [reason, lossDate ? `Billing ended ${formatHistoryDate(lossDate)}` : null, "Tracker written off"].filter(Boolean).join(" · "),
        });
        break;
      }
      default:
        break;
    }
  }

  // Newest first; rows on the same day keep the order in which they were produced, reversed, so a
  // later step in the same day (e.g. a price set at start) never sorts above what came after it.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.date.getTime() - a.row.date.getTime() || b.index - a.index)
    .map(({ row }) => row);
}
