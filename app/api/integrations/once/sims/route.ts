import { nceJson, OneNceConfigError } from "@/lib/nce/client";

export const runtime = "nodejs";

/**
 * GET /api/integrations/once/sims?page=&pageSize=
 * Proxies to 1NCE GET /v1/sims (requires ONCE_CLIENT_ID / ONCE_CLIENT_SECRET).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const qs = url.searchParams.toString();
    const path = qs ? `/v1/sims?${qs}` : "/v1/sims";
    const data = await nceJson<unknown>(path);
    return Response.json({ source: "1nce", data });
  } catch (e) {
    if (e instanceof OneNceConfigError) {
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
