import { getSession } from "@/lib/auth/get-session";
import { buildCustomerStatementPdfBuffer } from "@/lib/billing/customer-statement-pdf";
import {
  buildCustomerStatement,
  resolveStatementPeriod,
  statementPdfFilename,
  validateStatementPeriod,
} from "@/lib/billing/customer-statement";
import { loadPdfHeaderLogo } from "@/lib/proposals/pdf-header-logo";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId")?.trim() ?? "";
  const period = resolveStatementPeriod({
    preset: url.searchParams.get("preset"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  if (!customerId) {
    return Response.json({ error: "customerId is required." }, { status: 400 });
  }

  const periodError = validateStatementPeriod(period.from, period.to);
  if (periodError) {
    return Response.json({ error: periodError }, { status: 400 });
  }

  try {
    const statement = await buildCustomerStatement({
      customerId,
      from: period.from,
      to: period.to,
    });
    if ("error" in statement) {
      return Response.json({ error: statement.error }, { status: 400 });
    }

    const headerLogo = await loadPdfHeaderLogo();
    const buffer = buildCustomerStatementPdfBuffer(statement, headerLogo);
    const filename = statementPdfFilename(statement.customerName, period.from, period.to);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not build statement PDF.";
    console.error("[statements/pdf]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
