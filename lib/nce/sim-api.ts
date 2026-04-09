import "server-only";

import { nceJson } from "./client";

const SIM_LIST_PAGE_SIZE = 100;

/**
 * Fetches all SIM rows from GET /v1/sims (paginated). Stops when a page returns fewer than page_size items.
 */
export async function fetchAllOneNceSimsFromList(): Promise<unknown[]> {
  const out: unknown[] = [];
  let page = 1;
  while (page <= 500) {
    const qs = new URLSearchParams({
      page: String(page),
      page_size: String(SIM_LIST_PAGE_SIZE),
    });
    const body = await nceJson<unknown>(`/v1/sims?${qs.toString()}`);
    const batch = extractSimsArrayFromListResponse(body);
    out.push(...batch);
    if (batch.length < SIM_LIST_PAGE_SIZE) break;
    page += 1;
  }
  return out;
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
  }

  if (totalDataMB == null) {
    totalDataMB = firstNumber([
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
