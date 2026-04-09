import { InvoilessConfigError, invoilessJson } from "@/lib/invoiless/client";

export const runtime = "nodejs";

/**
 * GET /api/integrations/invoiless/invoices?page=&limit=&search=
 * Proxies to Invoiless GET /v1/invoices.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const qs = url.searchParams.toString();
    const path = qs ? `/invoices?${qs}` : "/invoices";
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
