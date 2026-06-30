import "server-only";

import { randomBytes } from "node:crypto";

import type { InvoiceKind, InvoiceStatus, PaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  computeDocumentTotals,
  computeLineTotal,
  toMoneyString,
  toQtyString,
} from "@/lib/domain/native-billing";
import { isInvoilessLegacyUiEnabled } from "@/lib/domain/native-billing-cutover";
import { fetchInvoilessInvoiceForEdit } from "@/lib/invoiless/invoice-mutate";
import {
  fetchInvoicesPage,
  isInvoilessConfigured,
  type InvoilessInvoiceListRow,
} from "@/lib/invoiless/invoices-list";
import { findTlCustomerIdByInvoilessExternalId } from "@/lib/services/billing-service";

export type InvoilessBackfillBatchResult = {
  ok: true;
  page: number;
  processed: number;
  imported: number;
  skipped: number;
  errors: string[];
  hasMore: boolean;
  nextPage: number | null;
};

export type InvoilessBackfillStatus = {
  configured: boolean;
  legacyUiEnabled: boolean;
  importedCount: number;
  nativeInvoiceCount: number;
};

function randomToken(): string {
  return randomBytes(18).toString("base64url");
}

function parseYmdToUtcNoon(ymd: string | null | undefined): Date | null {
  const s = ymd?.trim();
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapInvoilessStatus(raw: string | null | undefined, total: number, amountPaid: number): InvoiceStatus {
  const s = (raw ?? "").trim().toLowerCase();
  if (s.includes("void") || s.includes("cancel")) return "void";
  if (s.includes("written")) return "written_off";
  if (s.includes("draft")) return "draft";
  if (s.includes("partial")) return "partially_paid";
  if (s.includes("paid") || s === "complete" || s === "completed") return "paid";
  if (s.includes("overdue")) return "overdue";
  if (amountPaid > 0 && amountPaid < total) return "partially_paid";
  if (amountPaid >= total && total > 0) return "paid";
  if (s.includes("sent") || s.includes("open") || s.includes("unpaid")) return "open";
  return "open";
}

function paymentMethodFromInvoilessStatus(status: string | null): PaymentMethod {
  const s = (status ?? "").toLowerCase();
  if (s.includes("stripe") || s.includes("card")) return "card_manual";
  if (s.includes("bank") || s.includes("transfer")) return "bank_transfer";
  if (s.includes("cheque") || s.includes("check")) return "cheque";
  if (s.includes("cash")) return "cash";
  return "other";
}

export async function getInvoilessBackfillStatus(): Promise<InvoilessBackfillStatus> {
  const [importedCount, nativeInvoiceCount] = await Promise.all([
    prisma.invoice.count({ where: { kind: "invoiless_import" } }),
    prisma.invoice.count(),
  ]);
  return {
    configured: isInvoilessConfigured(),
    legacyUiEnabled: isInvoilessLegacyUiEnabled(),
    importedCount,
    nativeInvoiceCount,
  };
}

async function importSingleInvoilessRow(
  listRow: InvoilessInvoiceListRow,
): Promise<"imported" | "skipped" | { error: string }> {
  const invoilessId = listRow.id.trim();
  if (!invoilessId) return { error: "Missing Invoiless invoice id." };

  const existing = await prisma.invoice.findUnique({
    where: { invoilessInvoiceId: invoilessId },
    select: { id: true },
  });
  if (existing) return "skipped";

  if (listRow.isRetainer) {
    return "skipped";
  }

  let detail;
  try {
    detail = await fetchInvoilessInvoiceForEdit(invoilessId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load invoice from Invoiless." };
  }

  const customerId = detail.invoilessCustomerId
    ? await findTlCustomerIdByInvoilessExternalId(detail.invoilessCustomerId)
    : null;

  const currency = (listRow.currency ?? "XCD").toUpperCase();
  const lineInputs = detail.items
    .filter((item) => item.name.trim())
    .map((item, index) => ({
      description: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      sortOrder: index,
    }));

  if (!lineInputs.length) {
    const fallbackTotal = listRow.total ?? 0;
    if (fallbackTotal > 0) {
      lineInputs.push({
        description: "Imported from Invoiless",
        quantity: 1,
        unitPrice: fallbackTotal,
        sortOrder: 0,
      });
    } else {
      return { error: `Invoice ${invoilessId} has no line items.` };
    }
  }

  const totals = computeDocumentTotals(lineInputs, null);
  const total = listRow.total != null && listRow.total > 0 ? listRow.total : totals.total;
  const mappedStatus = mapInvoilessStatus(detail.status ?? listRow.status, total, 0);

  let amountPaid = 0;
  let amountDue = total;
  let paidAt: Date | null = null;
  if (mappedStatus === "paid") {
    amountPaid = total;
    amountDue = 0;
    paidAt = parseYmdToUtcNoon(detail.invoiceDateInput) ?? new Date();
  } else if (mappedStatus === "partially_paid") {
    amountPaid = Math.min(total * 0.5, total);
    amountDue = total - amountPaid;
  }

  const issueDate = parseYmdToUtcNoon(detail.invoiceDateInput) ?? new Date();
  const dueDate = parseYmdToUtcNoon(detail.dueDateInput);
  const isFinalized = mappedStatus !== "draft";
  const publicToken = isFinalized ? randomToken() : null;
  const sentAt = isFinalized ? issueDate : null;
  const voidedAt = mappedStatus === "void" ? new Date() : null;

  const billToName = listRow.customerLabel?.trim() || null;
  const kind: InvoiceKind = "invoiless_import";
  const legacyNumber = detail.number ?? listRow.number ?? null;

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        status: mappedStatus,
        kind,
        customerId,
        billToName,
        billToLines: [],
        currency,
        subtotal: toMoneyString(totals.subtotal),
        taxTotal: toMoneyString(totals.taxTotal),
        total: toMoneyString(total),
        amountPaid: toMoneyString(amountPaid),
        amountDue: toMoneyString(amountDue),
        issueDate,
        dueDate,
        notes: detail.notes?.trim() || null,
        publicToken,
        sentAt,
        paidAt,
        voidedAt,
        invoilessInvoiceId: invoilessId,
        legacyInvoiceNumber: legacyNumber,
        importedAt: new Date(),
        lineItems: {
          create: lineInputs.map((line) => ({
            sortOrder: line.sortOrder,
            description: line.description,
            quantity: toQtyString(line.quantity),
            unitPrice: toMoneyString(line.unitPrice),
            lineTotal: toMoneyString(computeLineTotal(line.quantity, line.unitPrice)),
          })),
        },
      },
      select: { id: true },
    });

    if (mappedStatus === "paid" && amountPaid > 0) {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          customerId,
          amount: toMoneyString(amountPaid),
          currency,
          method: paymentMethodFromInvoilessStatus(detail.status ?? listRow.status),
          reference: legacyNumber ? `Invoiless ${legacyNumber}` : `Invoiless ${invoilessId}`,
          receivedAt: paidAt ?? issueDate,
          notes: "Imported from Invoiless",
        },
      });
    }
  });

  return "imported";
}

/**
 * Import one page of Invoiless invoices into native `Invoice` rows.
 * Call repeatedly with increasing `page` until `hasMore` is false.
 */
export async function importInvoilessInvoicesBatch(params?: {
  page?: number;
  limit?: number;
}): Promise<InvoilessBackfillBatchResult> {
  if (!isInvoilessConfigured()) {
    throw new Error("INVOILESS_API_KEY is not set.");
  }

  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(50, Math.max(1, params?.limit ?? 25));

  const { rows, pagination } = await fetchInvoicesPage({ page, limit });
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const result = await importSingleInvoilessRow(row);
    if (result === "imported") {
      imported += 1;
    } else if (result === "skipped") {
      skipped += 1;
    } else {
      errors.push(`${row.id}: ${result.error}`);
    }
  }

  const hasMore = page < pagination.totalPages;
  return {
    ok: true,
    page,
    processed: rows.length,
    imported,
    skipped,
    errors,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  };
}
