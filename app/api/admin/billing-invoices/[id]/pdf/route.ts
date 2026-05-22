import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";
import {
  generateAndStorePaidInvoicePdf,
  loadBillingInvoicePdfBytes,
} from "@/lib/services/billing-paid-pdf-service";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("regenerate") === "1";

  let row = await prisma.billingInvoice.findUnique({
    where: { id },
    select: {
      id: true,
      displayNumber: true,
      pdfStoragePath: true,
      status: true,
    },
  });

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  if (!row.pdfStoragePath || force) {
    const gen = await generateAndStorePaidInvoicePdf(id, { force: true });
    if (!gen.ok) {
      return new Response(gen.error, { status: 400 });
    }
    row = await prisma.billingInvoice.findUnique({
      where: { id },
      select: {
        id: true,
        displayNumber: true,
        pdfStoragePath: true,
        status: true,
      },
    });
  }

  if (!row?.pdfStoragePath) {
    return new Response("PDF not available", { status: 404 });
  }

  const bytes = await loadBillingInvoicePdfBytes(row.pdfStoragePath);
  if (!bytes) {
    return new Response("PDF not found in storage", { status: 404 });
  }

  const filename = `${(row.displayNumber ?? "invoice").replace(/[^\w-]+/g, "-")}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
