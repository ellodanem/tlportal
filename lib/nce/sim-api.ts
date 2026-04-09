import "server-only";

import { nceJson } from "./client";

/** Request up to 100 per page (1NCE allows 1–100; default response is often 10 if ignored). */
const SIM_LIST_PAGE_SIZE = 100;
const SIM_LIST_MAX_PAGES = 200;

/**
 * Fetches all SIM rows from GET /v1/sims (paginated).
 * Continues until a page is empty, or `pageAmount` indicates the last page — not when `len < requested size`,
 * because APIs may cap below 100 (e.g. 10 per page) which previously stopped the loop after page 1.
 */
export async function fetchAllOneNceSimsFromList(): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 1;

  while (page <= SIM_LIST_MAX_PAGES) {
    const qs = new URLSearchParams({
      page: String(page),
      page_size: String(SIM_LIST_PAGE_SIZE),
    });
    const body = await nceJson<unknown>(`/v1/sims?${qs.toString()}`);
    const batch = extractSimsArrayFromListResponse(body);

    if (batch.length === 0) {
      break;
    }
    out.push(...batch);

    if (shouldStopSimListPagination(body, page)) {
      break;
    }
    page += 1;
  }
  return out;
}

function shouldStopSimListPagination(body: unknown, currentPage: number): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;

  const pageAmount = pickPositiveInt(o.pageAmount);
  const pageIndex = pickPositiveInt(o.page) ?? currentPage;
  if (pageAmount != null && pageIndex >= pageAmount) {
    return true;
  }

  return false;
}

function pickPositiveInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function extractSimsArrayFromListResponse(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const o = body as Record<string, unknown>;
  const keys = ["sims", "data", "items", "content", "results"] as const;
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

export function iccidFromSimPayload(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const raw = o.iccid ?? o.ICCID;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** GET /v1/sims/:iccid — raw payload (shape varies by product). */
export async function fetchOneNceSimByIccid(iccid: string): Promise<unknown> {
  const path = `/v1/sims/${encodeURIComponent(iccid)}`;
  return nceJson<unknown>(path);
}

/** GET /v1/sims/:iccid/quota/data — data allowance / usage (often populated when list rows omit volumes). */
export async function fetchOneNceSimDataQuota(iccid: string): Promise<unknown> {
  return nceJson<unknown>(`/v1/sims/${encodeURIComponent(iccid)}/quota/data`);
}

/**
 * Single-SIM detail + optional quota endpoint, merged. Use for sync and post-import enrichment.
 */
export async function fetchMergedSimFieldsForIccid(iccid: string): Promise<ParsedSimFields> {
  const detailRaw = await fetchOneNceSimByIccid(iccid);
  const base = parseSimDetailPayload(detailRaw);

  let qTotal: number | null = null;
  let qUsed: number | null = null;
  try {
    const quotaRaw = await fetchOneNceSimDataQuota(iccid);
    const q = parseDataQuotaPayload(quotaRaw);
    qTotal = q.totalDataMB;
    qUsed = q.usedDataMB;
  } catch {
    // Quota path may 404 for some products; detail-only is still useful.
  }

  return {
    ...base,
    totalDataMB: qTotal ?? base.totalDataMB,
    usedDataMB: qUsed ?? base.usedDataMB,
  };
}

/** Bytes → MB when value looks like bytes; otherwise assume already MB. */
function normalizeVolumeToMb(n: number): number {
  if (!Number.isFinite(n)) return n;
  if (n > 1_000_000) return n / (1024 * 1024);
  return n;
}

function quotaPayloadRoots(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];
  const roots: Record<string, unknown>[] = [body as Record<string, unknown>];
  const o = body as Record<string, unknown>;
  for (const key of ["data", "quota", "result"] as const) {
    const v = o[key];
    if (v && typeof v === "object") roots.push(v as Record<string, unknown>);
  }
  return roots;
}

function pickQuotaTotalMb(c: Record<string, unknown>): number | null {
  const t = firstNumber([
    c.totalVolume,
    c.total_volume,
    c.total_data_volume,
    c.volume_total,
    c.included_volume,
    c.data_volume_total,
    c.limit,
    c.max_volume,
    c.quota_mb,
    c.total,
  ]);
  return t == null ? null : normalizeVolumeToMb(t);
}

function pickQuotaExplicitUsedMb(c: Record<string, unknown>): number | null {
  const u = firstNumber([
    c.used_volume,
    c.volume_used,
    c.data_used,
    c.consumed_volume,
    c.used_data_volume,
    c.used_data,
    c.used,
  ]);
  return u == null ? null : normalizeVolumeToMb(u);
}

/**
 * Remaining pool volume. 1NCE `GET .../quota/data` often uses `volume` for **remaining** MB
 * alongside `totalVolume` (not cumulative used).
 */
function pickQuotaRemainingMb(c: Record<string, unknown>, totalMb: number | null): number | null {
  const r = firstNumber([
    c.remaining_volume,
    c.remainingVolume,
    c.available_volume,
    c.availableVolume,
    c.remaining,
  ]);
  if (r != null) return normalizeVolumeToMb(r);
  const vol = firstNumber([c.volume]);
  if (vol != null && totalMb != null) {
    const rem = normalizeVolumeToMb(vol);
    if (rem <= totalMb * 1.001) return rem;
  }
  return null;
}

/**
 * 1NCE `GET /v1/sims/:iccid/quota/data` commonly returns:
 * `{ "volume": <remaining MB>, "totalVolume": <pool MB>, "expiryDate": ... }`
 * — used = totalVolume − volume (remaining) when no explicit used field exists.
 */
function parseDataQuotaPayload(body: unknown): { totalDataMB: number | null; usedDataMB: number | null } {
  const empty = { totalDataMB: null as number | null, usedDataMB: null as number | null };
  if (!body || typeof body !== "object") return empty;

  const roots = quotaPayloadRoots(body);
  let totalDataMB: number | null = null;
  let usedDataMB: number | null = null;

  for (const c of roots) {
    const total = pickQuotaTotalMb(c);
    const explicitUsed = pickQuotaExplicitUsedMb(c);
    const remaining = pickQuotaRemainingMb(c, total);
    const derivedUsed =
      total != null && remaining != null ? Math.max(0, total - remaining) : null;
    const used = explicitUsed ?? derivedUsed;

    if (total != null) totalDataMB = totalDataMB ?? total;
    if (used != null) usedDataMB = usedDataMB ?? used;
  }

  return { totalDataMB, usedDataMB };
}

export type UsageSeriesPoint = { date: Date; usedMb: number };

/**
 * GET /v1/sims/:iccid/usage — daily stats for chart (last ~90 days max window per API docs).
 */
export async function fetchOneNceSimUsageSeries(
  iccid: string,
  start: Date,
  end: Date,
): Promise<UsageSeriesPoint[]> {
  const qs = new URLSearchParams({
    start_dt: start.toISOString().slice(0, 10),
    end_dt: end.toISOString().slice(0, 10),
  });
  const path = `/v1/sims/${encodeURIComponent(iccid)}/usage?${qs.toString()}`;
  const body = await nceJson<unknown>(path);
  return parseUsageSeries(body);
}

function parseUsageSeries(body: unknown): UsageSeriesPoint[] {
  if (!body || typeof body !== "object") return [];
  const stats = (body as { stats?: unknown }).stats;
  if (!Array.isArray(stats)) return [];

  const out: UsageSeriesPoint[] = [];
  for (const row of stats) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateRaw = r.date ?? r.day ?? r.timestamp;
    const at =
      typeof dateRaw === "string"
        ? new Date(dateRaw)
        : dateRaw instanceof Date
          ? dateRaw
          : null;
    if (!at || Number.isNaN(at.getTime())) continue;

    const data = r.data;
    let mb = 0;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const vol = d.volume ?? d.volume_used ?? d.data_volume ?? d.used_volume;
      mb = volumeToMb(vol);
    }
    if (mb === 0) {
      mb = volumeToMb(r.volume ?? r.used_volume);
    }
    out.push({ date: at, usedMb: mb });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Accepts number (bytes or MB heuristics) or numeric string; best-effort. */
function volumeToMb(vol: unknown): number {
  if (vol == null) return 0;
  if (typeof vol === "number" && Number.isFinite(vol)) {
    if (vol > 1_000_000) return vol / (1024 * 1024);
    if (vol > 10_000) return vol / 1024;
    return vol;
  }
  if (typeof vol === "string") {
    const n = parseFloat(vol.replace(/,/g, ""));
    if (!Number.isFinite(n)) return 0;
    return n > 1_000_000 ? n / (1024 * 1024) : n;
  }
  return 0;
}

export type ParsedSimFields = {
  msisdn: string | null;
  imsi: string | null;
  label: string | null;
  status: string | null;
  totalDataMB: number | null;
  usedDataMB: number | null;
};

export function parseSimDetailPayload(body: unknown): ParsedSimFields {
  if (!body || typeof body !== "object") {
    return emptyParsed();
  }
  const o = body as Record<string, unknown>;

  const msisdn = pickString(o, ["msisdn", "msisdn_number", "phone_number"]);
  const imsi = pickString(o, ["imsi"]);
  const label = pickString(o, ["label", "name", "alias"]);

  let status: string | null = null;
  if (typeof o.status === "string") status = o.status;
  else if (o.status && typeof o.status === "object") {
    const s = o.status as Record<string, unknown>;
    status = pickString(s, ["description", "name", "label"]) ?? String(s.id ?? "");
  }

  let totalDataMB: number | null = null;
  let usedDataMB: number | null = null;

  const quota = o.quota ?? o.data_quota ?? o.volume_quota ?? o.services;
  if (quota && typeof quota === "object") {
    const q = quota as Record<string, unknown>;
    totalDataMB = firstNumber([
      q.totalVolume,
      q.total_volume,
      q.total_data_volume,
      q.volume_total,
      q.max_volume,
      q.included_volume,
    ]);
    usedDataMB = firstNumber([
      q.used_volume,
      q.volume_used,
      q.consumed_volume,
      q.data_used,
    ]);
    if (totalDataMB != null && totalDataMB > 1_000_000) totalDataMB = totalDataMB / (1024 * 1024);
    if (usedDataMB != null && usedDataMB > 1_000_000) usedDataMB = usedDataMB / (1024 * 1024);
    const rem = pickQuotaRemainingMb(q, totalDataMB);
    if (usedDataMB == null && totalDataMB != null && rem != null) {
      usedDataMB = Math.max(0, totalDataMB - rem);
    }
  }

  if (totalDataMB == null) {
    totalDataMB = firstNumber([
      o.totalVolume,
      o.total_volume,
      o.data_volume_total,
      o.included_data_mb,
      o.quota_mb,
    ]);
  }
  if (usedDataMB == null) {
    usedDataMB = firstNumber([o.used_volume, o.data_used, o.volume_used]);
  }

  if (totalDataMB != null && totalDataMB > 1_000_000) totalDataMB = totalDataMB / (1024 * 1024);
  if (usedDataMB != null && usedDataMB > 1_000_000) usedDataMB = usedDataMB / (1024 * 1024);

  if (usedDataMB == null && totalDataMB != null) {
    const remRoot = pickQuotaRemainingMb(o, totalDataMB);
    if (remRoot != null) usedDataMB = Math.max(0, totalDataMB - remRoot);
  }

  return {
    msisdn,
    imsi,
    label,
    status: status || null,
    totalDataMB: totalDataMB ?? null,
    usedDataMB: usedDataMB ?? null,
  };
}

function emptyParsed(): ParsedSimFields {
  return { msisdn: null, imsi: null, label: null, status: null, totalDataMB: null, usedDataMB: null };
}

function pickString(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function firstNumber(keys: unknown[]): number | null {
  for (const v of keys) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v.replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}
