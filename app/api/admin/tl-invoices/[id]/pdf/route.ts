import { getSession } from "@/lib/auth/get-session";
import { buildInvoicePdfFromInvoiceId } from "@/lib/billing/invoice-from-db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    const built = await buildInvoicePdfFromInvoiceId(id);
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
    const message = e instanceof Error ? e.message : "Could not build invoice PDF.";
    console.error("[tl-invoices/[id]/pdf]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
