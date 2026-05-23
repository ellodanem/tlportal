/**
 * 1NCE SIM lifecycle labels (API list/detail and customer portal).
 * @see https://help.1nce.com/docs/1nce-portal/portal-sims-sms/
 */
const ONCE_SIM_OPERATIONAL_STATUSES = new Set([
  "active", // TL Portal default when a row is created before sync
  "enabled", // 1NCE API (e.g. GET /v1/sims)
  "activated", // 1NCE portal column
]);

/** True when the stored status means the SIM can connect on 1NCE (fleet-health, ops). */
export function isOnceSimOperational(status: string | null | undefined): boolean {
  if (!status?.trim()) return false;
  return ONCE_SIM_OPERATIONAL_STATUSES.has(status.trim().toLowerCase());
}
