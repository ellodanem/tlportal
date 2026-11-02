import assert from "node:assert/strict";
import test from "node:test";

import {
  GROUPED_LINE_UNIT_LABEL,
  SchedulePresentationError,
  groupedLinesStillValid,
  isGroupedScheduleLines,
  validatePresentationLines,
} from "../lib/domain/canonical-schedule-presentation";

test("five vehicles can be presented as one line when the total matches", () => {
  const lines = validatePresentationLines(
    [{ description: "  Annual GPS tracking  ", quantity: 5, unitPrice: 300 }],
    "1500.00",
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].description, "Annual GPS tracking");
  assert.equal(lines[0].lineTotal.toFixed(2), "1500.00");
});

test("lines that do not add up to the cycle total are rejected", () => {
  assert.throws(
    () => validatePresentationLines([{ description: "Tracking", quantity: 4, unitPrice: 300 }], "1500.00"),
    (error: unknown) => error instanceof SchedulePresentationError && error.code === "TOTAL_MISMATCH",
  );
});

test("empty, blank, zero-quantity and negative-rate lines are rejected", () => {
  assert.throws(() => validatePresentationLines([], "0.00"), /at least one/);
  assert.throws(() => validatePresentationLines([{ description: " ", quantity: 1, unitPrice: 1 }], "1.00"), /description/);
  assert.throws(() => validatePresentationLines([{ description: "a", quantity: 0, unitPrice: 1 }], "0.00"), /quantity/);
  assert.throws(() => validatePresentationLines([{ description: "a", quantity: 1, unitPrice: -1 }], "-1.00"), /rate/);
});

test("regrouped lines stay valid only while they match the cycle total", () => {
  const stored = [{ description: "x5", quantity: "5", unitPrice: "300", lineTotal: "1500", unitLabel: GROUPED_LINE_UNIT_LABEL }];
  assert.equal(isGroupedScheduleLines(stored), true);
  assert.equal(groupedLinesStillValid(stored, "1500.00"), true);
  assert.equal(groupedLinesStillValid(stored, "1800.00"), false);
  assert.equal(groupedLinesStillValid([{ ...stored[0], unitLabel: "service" }], "1500.00"), false);
  assert.equal(isGroupedScheduleLines([]), false);
});
