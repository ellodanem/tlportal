import { getSession } from "@/lib/auth/get-session";
import { buildQuotePdfFromPayload } from "@/lib/billing/quote-build";
import { parseQuoteRequestBody } from "@/lib/billing/quote-payload";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseQuoteRequestBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const built = await buildQuotePdfFromPayload(parsed.payload);
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
    console.error("[quotes/pdf]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
