import { loadInvoiceByPublicToken } from "@/lib/billing/invoice-from-db";
import { buildNativeInvoicePdfBuffer } from "@/lib/billing/native-invoice-pdf";
import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import { resolveProposalHeaderLogoStored } from "@/lib/proposals/proposal-cover-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const invoice = await loadInvoiceByPublicToken(token);
  if (!invoice || invoice.status === "draft" || !invoice.lineItems.length) {
    return new Response("Not found", { status: 404 });
  }

  const brandingStored = await getBrandingLogoStored();
  const headerLogo = await fetchImageAsLogo(null, resolveProposalHeaderLogoStored(brandingStored));

  const buffer = buildNativeInvoicePdfBuffer({
    invoiceNumber: invoice.number ?? "Invoice",
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    billToLines: invoice.billToLines.length ? invoice.billToLines : [invoice.billToName ?? "Customer"],
    lineItems: invoice.lineItems.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
    })),
    subtotal: Number(invoice.subtotal),
    discountTotal: Number(invoice.discountTotal),
    taxLabel: invoice.taxLabel,
    taxTotal: Number(invoice.taxTotal),
    total: Number(invoice.total),
    amountPaid: Number(invoice.amountPaid),
    amountDue: Number(invoice.amountDue),
    notes: invoice.notes,
    paymentInstructions: invoice.paymentInstructions,
    isPaid: invoice.status === "paid",
    headerLogo,
  });

  const slug = (invoice.number ?? token.slice(0, 8)).replace(/[^\w.-]+/g, "_");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${slug}.pdf"`,
    },
  });
}
