import type { BillingInvoice } from "@prisma/client";

/** Serializable billing invoice row for Client Components (no Prisma Decimal). */
export type BillingInvoiceClientRow = Omit<BillingInvoice, "amountXcd"> & {
  amountXcd: number;
};

export function toBillingInvoiceClientRow(inv: BillingInvoice): BillingInvoiceClientRow {
  return {
    ...inv,
    amountXcd: Number(inv.amountXcd),
  };
}
