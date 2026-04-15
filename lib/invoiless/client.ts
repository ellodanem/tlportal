const BASE = "https://api.invoiless.com/v1";

/** Invoiless list APIs return 400 if `limit` is below this (e.g. GET /v1/invoices). */
export const INVOILESS_LIST_LIMIT_MIN = 10;

/** Clamp page size for Invoiless list endpoints (min 10, max 100 by default). */
export function clampInvoilessListLimit(
  limit: number | undefined | null,
  fallback = 50,
  max = 100,
): number {
  const raw = limit == null ? fallback : Number(limit);
  const x = Math.floor(raw);
  if (!Number.isFinite(x)) {
    return Math.min(max, Math.max(INVOILESS_LIST_LIMIT_MIN, fallback));
  }
  return Math.min(max, Math.max(INVOILESS_LIST_LIMIT_MIN, x));
}

export class InvoilessConfigError extends Error {
  constructor(message = "INVOILESS_API_KEY is not set") {
    super(message);
    this.name = "InvoilessConfigError";
  }
}

function getApiKey(): string {
  const key = process.env.INVOILESS_API_KEY?.trim();
  if (!key) {
    throw new InvoilessConfigError();
  }
  return key;
}

export type InvoilessRequestInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/**
 * Server-only Invoiless REST client. Pass paths like `/customers` or `customers`.
 */
export async function invoilessFetch(
  path: string,
  init: InvoilessRequestInit = {},
): Promise<Response> {
  const key = getApiKey();
  const url = path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    "api-key": key,
    Accept: "application/json",
    ...init.headers,
  };
  if (method !== "GET" && method !== "HEAD" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...init, headers });
}

export async function invoilessJson<T>(
  path: string,
  init: InvoilessRequestInit = {},
): Promise<T> {
  const res = await invoilessFetch(path, init);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const err = new Error(`Invoiless ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    (err as Error & { status?: number; body?: unknown }).status = res.status;
    (err as Error & { status?: number; body?: unknown }).body = body;
    throw err;
  }
  return body as T;
}
