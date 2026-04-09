import { getOneNceAccessToken } from "./token";

export { OneNceConfigError } from "./token";

const BASE = "https://api.1nce.com/management-api";

export type NceRequestInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/**
 * Authenticated fetch against the 1NCE Management API (Bearer token).
 */
export async function nceFetch(path: string, init: NceRequestInit = {}): Promise<Response> {
  const token = await getOneNceAccessToken();
  const url = path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...init.headers,
  };
  if (method !== "GET" && method !== "HEAD" && init.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...init, headers });
}

export async function nceJson<T>(path: string, init: NceRequestInit = {}): Promise<T> {
  const res = await nceFetch(path, init);
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
    const err = new Error(`1NCE ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    (err as Error & { status?: number; body?: unknown }).status = res.status;
    (err as Error & { status?: number; body?: unknown }).body = body;
    throw err;
  }
  return body as T;
}
