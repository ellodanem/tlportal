/**
 * Display-only helpers for the single-service screen. Nothing here changes billing: the billing
 * resolver, proration and rate scheduling stay in their existing services. These helpers only
 * decide what the page shows, and which operations it offers, from data the page already loaded.
 */

export type PresentationRate = {
  effectiveFrom: Date;
  effectiveUntil: Date | null;
};

const DAY_MS = 86_400_000;

function utcDay(value: Date): number {
  return Math.floor(value.getTime() / DAY_MS);
}

/**
 * The rate in force today, using the same half-open [from, until) window as the billing
 * resolver. Falls back to the most recent past rate for a service whose rates have all ended, and
 * to the earliest rate when every rate is still in the future, so a service never shows "Not set"
 * while rates exist.
 */
export function currentServiceRate<T extends PresentationRate>(rates: readonly T[], today: Date = new Date()): T | undefined {
  if (!rates.length) return undefined;
  const day = utcDay(today);
  const ordered = [...rates].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  const inForce = ordered.filter((rate) => utcDay(rate.effectiveFrom) <= day && (rate.effectiveUntil == null || day < utcDay(rate.effectiveUntil)));
  if (inForce.length) return inForce.at(-1);
  const past = ordered.filter((rate) => utcDay(rate.effectiveFrom) <= day);
  return past.length ? past.at(-1) : ordered[0];
}

/** The next rate that has been scheduled but has not started yet, if any. */
export function scheduledServiceRate<T extends PresentationRate>(rates: readonly T[], today: Date = new Date()): T | undefined {
  const day = utcDay(today);
  return [...rates]
    .filter((rate) => utcDay(rate.effectiveFrom) > day)
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0];
}

/** Whole days from `today` until `target` (UTC calendar days); negative when already past. */
export function daysUntil(target: Date, today: Date = new Date()): number {
  return utcDay(target) - utcDay(today);
}

export type ServiceActionKey =
  | "replaceTracker"
  | "swapSim"
  | "manageRate"
  | "pause"
  | "resume"
  | "transfer"
  | "vehicleSold"
  | "assetLost";

export type ServiceActionAvailability = { enabled: boolean; reason: string | null };

export type ServiceActionContext = {
  /** Staff may change this subscription (canonical, operational, not read-only/shadow). */
  canManage: boolean;
  itemStatus: string;
  /** The open (not ended, not cancelled) tracker assignment, if there is one. */
  openAssignment: { status: string } | null;
  billingEffectiveUntil: Date | null;
  /** Whether a successor service already continues this one under another subscription. */
  alreadyTransferred: boolean;
  transferTargetCount: number;
};

const CLOSED_STATUSES = ["ended", "canceled"];

const allowed: ServiceActionAvailability = { enabled: true, reason: null };
const denied = (reason: string): ServiceActionAvailability => ({ enabled: false, reason });

/**
 * Which operations a service offers, with a human reason when one is unavailable. This mirrors the
 * eligibility the server actions already enforce (open assignment, live service, manageable
 * subscription); the server remains the authority and re-checks every operation.
 */
export function resolveServiceActionAvailability(context: ServiceActionContext): Record<ServiceActionKey, ServiceActionAvailability> {
  const closed = CLOSED_STATUSES.includes(context.itemStatus);
  const paused = context.openAssignment?.status === "suspended";

  const base = (needsTracker: boolean): ServiceActionAvailability | null => {
    if (!context.canManage) return denied("This subscription is read-only, so services cannot be changed here.");
    if (closed) return denied("This service has ended.");
    if (needsTracker && !context.openAssignment) return denied("No tracker is currently assigned to this service.");
    return null;
  };

  const rateOrTransfer = base(false);
  const withTracker = base(true);

  return {
    replaceTracker: withTracker ?? allowed,
    swapSim: withTracker ?? allowed,
    manageRate: rateOrTransfer ?? allowed,
    pause: withTracker ?? (paused ? denied("This service is already paused.") : allowed),
    resume: withTracker ?? (!paused
      ? denied("This service is not paused.")
      : context.billingEffectiveUntil
        ? denied("This service has a billing end date, so it cannot be resumed. Add a new service to bill this tracker again.")
        : allowed),
    transfer: rateOrTransfer
      ?? (context.alreadyTransferred
        ? denied("This service has already been transferred.")
        : context.transferTargetCount === 0
          ? denied("No other active subscription exists for this customer to receive the service.")
          : allowed),
    vehicleSold: withTracker ?? (paused ? denied("Resume the paused service before recording a vehicle sale.") : allowed),
    assetLost: withTracker ?? allowed,
  };
}
