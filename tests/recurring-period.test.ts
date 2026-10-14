import assert from "node:assert/strict";
import test from "node:test";

import {
  addUtcMonths,
  nextRecurringScheduleDate,
  recurringGenerationKey,
  startOfUtcDay,
} from "../lib/billing/recurring-period";

test("recurring generation keys normalize a billing period to its UTC day", () => {
  const morning = new Date("2026-10-15T01:15:00.000Z");
  const evening = new Date("2026-10-15T22:45:00.000Z");

  assert.equal(
    recurringGenerationKey("schedule-1", morning),
    recurringGenerationKey("schedule-1", evening),
  );
  assert.notEqual(
    recurringGenerationKey("schedule-1", morning),
    recurringGenerationKey("schedule-2", morning),
  );
  assert.equal(startOfUtcDay(evening).toISOString(), "2026-10-15T00:00:00.000Z");
});

for (const [months, expected] of [
  [1, "2026-02-15T12:00:00.000Z"],
  [3, "2026-04-15T12:00:00.000Z"],
  [6, "2026-07-15T12:00:00.000Z"],
  [12, "2027-01-15T12:00:00.000Z"],
] as const) {
  test(`preserves the existing ${months}-month recurring interval`, () => {
    const issueDate = new Date("2026-01-15T12:00:00.000Z");
    assert.equal(addUtcMonths(issueDate, months).toISOString(), expected);
  });
}

test("a forced or retried period cannot move a schedule backwards", () => {
  const current = new Date("2027-01-15T12:00:00.000Z");
  const olderIssueDate = new Date("2026-01-15T12:00:00.000Z");

  assert.equal(
    nextRecurringScheduleDate(current, olderIssueDate, 3).toISOString(),
    current.toISOString(),
  );
});

test("preserves the existing UTC month-end rollover behavior", () => {
  const monthEnd = new Date("2026-01-31T12:00:00.000Z");
  assert.equal(addUtcMonths(monthEnd, 1).toISOString(), "2026-03-03T12:00:00.000Z");
});
