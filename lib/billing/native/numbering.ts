import "server-only";

import type { Prisma } from "@prisma/client";

import { allocateInvoiceSequenceValue, formatDisplayNumber } from "@/lib/billing/invoice-sequence";

const QUOTE_SEQUENCE_ID = "default" as const;

function quoteStartValue(): number {
  const raw = process.env.QUOTE_SEQUENCE_START?.trim();
  if (!raw) return 1000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

/** Format a native invoice serial as `TL-INV-{n}` (shared sequence with the Stripe mirror). */
export function formatInvoiceNumber(serial: number): string {
  return formatDisplayNumber(serial);
}

export function formatQuoteNumber(serial: number): string {
  return `TL-Q-${serial}`;
}

/**
 * Allocate the next `TL-INV-{n}` for a native invoice.
 * Uses the same atomic counter as `BillingInvoice` so numbers never collide.
 * Must run inside a transaction.
 */
export async function allocateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const serial = await allocateInvoiceSequenceValue(tx);
  return formatInvoiceNumber(serial);
}

/**
 * Atomically allocate the next quote serial. Must run inside a transaction.
 */
export async function allocateQuoteSequenceValue(tx: Prisma.TransactionClient): Promise<number> {
  const start = quoteStartValue();
  const rows = await tx.$queryRaw<{ nextValue: number }[]>`
    INSERT INTO "QuoteSequence" ("id", "nextValue", "updatedAt")
    VALUES (${QUOTE_SEQUENCE_ID}, ${start}, NOW())
    ON CONFLICT ("id") DO UPDATE
    SET "nextValue" = "QuoteSequence"."nextValue" + 1,
        "updatedAt" = NOW()
    RETURNING "nextValue"
  `;
  const n = rows[0]?.nextValue;
  if (n == null || !Number.isFinite(n)) {
    throw new Error("Quote sequence allocation failed");
  }
  return n;
}

/** Allocate the next `TL-Q-{n}` for a native quote. Must run inside a transaction. */
export async function allocateQuoteNumber(tx: Prisma.TransactionClient): Promise<string> {
  const serial = await allocateQuoteSequenceValue(tx);
  return formatQuoteNumber(serial);
}
