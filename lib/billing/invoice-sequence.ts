import "server-only";

import type { Prisma } from "@prisma/client";

const SEQUENCE_ID = "default" as const;

function sequenceStartValue(): number {
  const raw = process.env.INVOICE_SEQUENCE_START?.trim();
  if (!raw) return 100_900;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 100_900;
}

/**
 * Atomically allocate the next serial (used inside a transaction before setting displayNumber).
 */
export async function allocateInvoiceSequenceValue(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const start = sequenceStartValue();
  const rows = await tx.$queryRaw<{ nextValue: number }[]>`
    INSERT INTO "InvoiceSequence" ("id", "nextValue", "updatedAt")
    VALUES (${SEQUENCE_ID}, ${start}, NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "nextValue" = "InvoiceSequence"."nextValue" + 1,
        "updatedAt" = NOW()
    RETURNING "nextValue"
  `;
  const n = rows[0]?.nextValue;
  if (n == null || !Number.isFinite(n)) {
    throw new Error("Invoice sequence allocation failed");
  }
  return n;
}

export function formatDisplayNumber(serial: number): string {
  return `TL-INV-${serial}`;
}
