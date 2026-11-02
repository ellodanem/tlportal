/**
 * How a subscription-owned recurring schedule may present its invoice.
 *
 * The subscription stays the source of truth for services, rates and the cycle total. Staff may
 * regroup the invoice lines (for example one "Annual GPS tracking x 5" line instead of one line
 * per vehicle) as long as the lines add up to exactly the cycle total.
 */
import { Prisma } from "@prisma/client";

/** Marks stored schedule lines that staff regrouped; derived (per-service) lines use "service". */
export const GROUPED_LINE_UNIT_LABEL = "grouped";
export const DERIVED_LINE_UNIT_LABEL = "service";

export type PresentationLineInput = {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
};

export type StoredScheduleLine = {
  description: string;
  quantity: Prisma.Decimal | number | string;
  unitPrice: Prisma.Decimal | number | string;
  lineTotal: Prisma.Decimal | number | string;
  unitLabel: string | null;
};

export class SchedulePresentationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SchedulePresentationError";
    this.code = code;
  }
}

function lineTotal(line: {
  quantity: number | string | Prisma.Decimal;
  unitPrice: number | string | Prisma.Decimal;
}): Prisma.Decimal {
  return new Prisma.Decimal(line.quantity).times(new Prisma.Decimal(line.unitPrice)).toDecimalPlaces(2);
}

export function presentationLinesTotal(lines: readonly PresentationLineInput[]): Prisma.Decimal {
  return lines.reduce((sum, line) => sum.plus(lineTotal(line)), new Prisma.Decimal(0)).toDecimalPlaces(2);
}

/** Validates regrouped lines against the subscription's cycle total and returns normalised lines. */
export function validatePresentationLines(
  lines: readonly PresentationLineInput[],
  cycleSubtotal: Prisma.Decimal | string,
): { description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }[] {
  if (!lines.length) throw new SchedulePresentationError("NO_LINES", "Add at least one invoice line.");
  const normalised = lines.map((line, index) => {
    const description = line.description.trim();
    if (!description) throw new SchedulePresentationError("LINE_DESCRIPTION", `Line ${index + 1} needs a description.`);
    const quantity = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice);
    if (!quantity.isFinite() || quantity.lte(0)) {
      throw new SchedulePresentationError("LINE_QUANTITY", `Line ${index + 1} needs a quantity above zero.`);
    }
    if (!unitPrice.isFinite() || unitPrice.isNegative()) {
      throw new SchedulePresentationError("LINE_PRICE", `Line ${index + 1} needs a rate of zero or more.`);
    }
    return { description, quantity, unitPrice, lineTotal: lineTotal({ quantity, unitPrice }) };
  });
  const total = normalised.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const expected = new Prisma.Decimal(cycleSubtotal).toDecimalPlaces(2);
  if (!total.equals(expected)) {
    throw new SchedulePresentationError(
      "TOTAL_MISMATCH",
      `Lines add up to ${total.toFixed(2)} but the subscription's services come to ${expected.toFixed(2)} per cycle. `
        + "Change rates or services on the subscription to change the total.",
    );
  }
  return normalised;
}

/** True when staff regrouped the lines (every stored line carries the grouped marker). */
export function isGroupedScheduleLines(lines: readonly Pick<StoredScheduleLine, "unitLabel">[]): boolean {
  return lines.length > 0 && lines.every((line) => line.unitLabel === GROUPED_LINE_UNIT_LABEL);
}

/** Regrouped lines are only honoured while they still add up to the cycle total. */
export function groupedLinesStillValid(
  lines: readonly StoredScheduleLine[],
  cycleSubtotal: Prisma.Decimal | string,
): boolean {
  if (!isGroupedScheduleLines(lines)) return false;
  const total = lines.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.lineTotal)), new Prisma.Decimal(0));
  return total.toDecimalPlaces(2).equals(new Prisma.Decimal(cycleSubtotal).toDecimalPlaces(2));
}
