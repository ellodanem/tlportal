import { getSession } from "@/lib/auth/get-session";
import {
  expenseReceiptContentType,
  loadExpenseReceiptBytes,
} from "@/lib/expenses/receipt-storage";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: { receiptStoragePath: true, vendor: true },
  });
  if (!expense?.receiptStoragePath) return new Response("Not found", { status: 404 });

  const bytes = await loadExpenseReceiptBytes(expense.receiptStoragePath);
  if (!bytes) return new Response("Receipt not found", { status: 404 });

  const contentType = expenseReceiptContentType(expense.receiptStoragePath);
  const ext = contentType === "application/pdf" ? "pdf" : contentType.includes("png") ? "png" : "jpg";
  const slug = expense.vendor.replace(/[^\w.-]+/g, "_").slice(0, 40);

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="receipt-${slug}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
