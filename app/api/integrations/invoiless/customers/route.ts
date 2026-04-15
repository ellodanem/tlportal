import { clampInvoilessListLimit, InvoilessConfigError, invoilessJson } from "@/lib/invoiless/client";

export const runtime = "nodejs";

/**
 * GET /api/integrations/invoiless/customers?page=&limit=&search=
 * Proxies to Invoiless GET /v1/customers (requires INVOILESS_API_KEY).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    const limRaw = params.get("limit");
    if (limRaw != null) {
      const n = parseInt(limRaw, 10);
      params.set("limit", String(clampInvoilessListLimit(Number.isFinite(n) ? n : null)));
    }
    const qs = params.toString();
    const path = qs ? `/customers?${qs}` : "/customers";
    const data = await invoilessJson<unknown>(path);
    return Response.json({ source: "invoiless", data });
  } catch (e) {
    if (e instanceof InvoilessConfigError) {
      return Response.json(
        { error: e.message, configured: false },
        { status: 503 },
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = (e as Error & { status?: number }).status ?? 502;
    return Response.json({ error: message }, { status });
  }
}
