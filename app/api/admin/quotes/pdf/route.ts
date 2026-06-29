import { getSession } from "@/lib/auth/get-session";
import { getBrandingLogoStored } from "@/lib/branding/app-settings";
import { customerBillToLines } from "@/lib/billing/customer-bill-to";
import { parseQuoteRequestBody } from "@/lib/billing/quote-payload";
import { buildQuotePdfBuffer } from "@/lib/billing/quote-pdf";
import { prisma } from "@/lib/db";
import { fetchImageAsLogo } from "@/lib/proposals/fetch-image";
import { resolveProposalHeaderLogoStored } from "@/lib/proposals/proposal-cover-assets";
import { resolveAssetFetchOrigin } from "@/lib/proposals/resolve-asset-url";

export const runtime = "nodejs";

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

  const { payload } = parsed;
  let billToLines = payload.billToLines ?? [];

  if (!billToLines.length && payload.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: payload.customerId },
      select: {
        company: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
      },
    });
    if (!customer) {
      return Response.json({ error: "Customer not found." }, { status: 404 });
    }
    billToLines = customerBillToLines(customer);
  }

  if (!billToLines.length) {
    return Response.json({ error: "Choose a customer or enter a client name." }, { status: 400 });
  }

  const origin = resolveAssetFetchOrigin(req);
  const brandingStored = await getBrandingLogoStored();
  const headerLogo = await fetchImageAsLogo(origin, resolveProposalHeaderLogoStored(brandingStored));

  const buf = buildQuotePdfBuffer({
    quoteNumber: payload.quoteNumber,
    quoteDate: new Date(`${payload.quoteDate}T12:00:00.000Z`),
    validUntil: new Date(`${payload.validUntil}T12:00:00.000Z`),
    currency: payload.currency,
    billToLines,
    lineItems: payload.lineItems,
    notes: payload.notes,
    headerLogo,
  });

  const safeName = `quote-${payload.quoteNumber.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
