import { getSession } from "@/lib/auth/get-session";
import { buildQuotePdfFromQuoteId } from "@/lib/billing/quote-from-db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const built = await buildQuotePdfFromQuoteId(id);
    if ("error" in built) {
      return Response.json({ error: built.error }, { status: 400 });
    }

    return new Response(new Uint8Array(built.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${built.filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not build quote PDF.";
    console.error("[quotes/[id]/pdf]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
