import { getSession } from "@/lib/auth/get-session";
import { EXPENSE_PAYMENT_METHOD_LABELS, parseYearMonth } from "@/lib/domain/expenses";
import { prisma } from "@/lib/db";
import { expenseListWhere } from "@/lib/services/expense-service";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const { year, month } = parseYearMonth(url.searchParams.get("ym") ?? undefined);
  const categoryId = url.searchParams.get("category")?.trim() || null;

  const expenses = await prisma.expense.findMany({
    where: expenseListWhere({ year, month, categoryId }),
    orderBy: { expenseDate: "asc" },
    include: {
      category: { select: { name: true } },
      customer: { select: { company: true, firstName: true, lastName: true } },
      device: { select: { label: true, imei: true } },
    },
  });

  const header = [
    "Date",
    "Vendor",
    "Description",
    "Category",
    "Amount",
    "Currency",
    "Method",
    "Reference",
    "Customer",
    "Device",
    "Notes",
  ];

  const lines = [header.join(",")];
  for (const e of expenses) {
    const customerLabel = e.customer
      ? [e.customer.company, e.customer.firstName, e.customer.lastName].filter(Boolean).join(" ")
      : "";
    const deviceLabel = e.device?.label?.trim() || e.device?.imei || "";
    const row = [
      e.expenseDate.toISOString().slice(0, 10),
      e.vendor,
      e.description ?? "",
      e.category?.name ?? "",
      Number(e.amount).toFixed(2),
      e.currency,
      EXPENSE_PAYMENT_METHOD_LABELS[e.method],
      e.reference ?? "",
      customerLabel,
      deviceLabel,
      e.notes ?? "",
    ].map((cell) => csvEscape(String(cell)));
    lines.push(row.join(","));
  }

  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const body = lines.join("\r\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${ym}.csv"`,
    },
  });
}
