import { getSession } from "@/lib/auth/get-session";
import {
  AR_AGING_BUCKET_LABELS,
  AR_AGING_BUCKET_ORDER,
  monthLabelUtc,
  PAYMENT_METHOD_LABELS,
} from "@/lib/domain/billing-reports";
import { parseYearMonth } from "@/lib/domain/expenses";
import { INVOICE_STATUS_LABELS } from "@/lib/domain/native-billing";
import { getBillingMonthlyReport } from "@/lib/services/native-billing-reporting-service";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function line(cells: string[]): string {
  return cells.map((c) => csvEscape(c)).join(",");
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const { year, month } = parseYearMonth(url.searchParams.get("ym") ?? undefined);
  const report = await getBillingMonthlyReport(year, month);
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const periodLabel = monthLabelUtc(year, month);

  const rows: string[] = [];
  rows.push(line(["Billing report", periodLabel]));
  rows.push("");
  rows.push(line(["Summary", "Amount (XCD)"]));
  rows.push(line(["Revenue (cash in)", report.revenue.total.toFixed(2)]));
  rows.push(line(["Expenses", report.expenses.total.toFixed(2)]));
  rows.push(line(["Net (revenue - expenses)", report.netCashFlow.toFixed(2)]));
  rows.push(line(["AR outstanding (all open)", report.arAging.totalOutstanding.toFixed(2)]));
  rows.push("");

  rows.push(line(["Revenue by payment method", "Amount", "Count"]));
  for (const row of report.revenue.byMethod) {
    rows.push(line([PAYMENT_METHOD_LABELS[row.method], row.total.toFixed(2), String(row.count)]));
  }
  rows.push("");

  rows.push(line(["Expenses by category", "Amount", "Count"]));
  for (const row of report.expenses.byCategory) {
    rows.push(line([row.categoryName, row.total.toFixed(2), String(row.count)]));
  }
  rows.push("");

  rows.push(line(["AR aging bucket", "Amount", "Invoice count"]));
  for (const bucket of AR_AGING_BUCKET_ORDER) {
    const b = report.arAging.buckets[bucket];
    rows.push(line([AR_AGING_BUCKET_LABELS[bucket], b.total.toFixed(2), String(b.count)]));
  }
  rows.push("");

  rows.push(line(["AR detail — invoice", "Client", "Due date", "Status", "Bucket", "Amount due"]));
  for (const inv of report.arAging.invoices) {
    rows.push(
      line([
        inv.number ?? inv.invoiceId,
        inv.customerLabel,
        inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "",
        INVOICE_STATUS_LABELS[inv.status],
        AR_AGING_BUCKET_LABELS[inv.bucket],
        inv.amountDue.toFixed(2),
      ]),
    );
  }

  const body = rows.join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="billing-report-${ym}.csv"`,
    },
  });
}
