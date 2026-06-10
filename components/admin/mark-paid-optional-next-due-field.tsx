import { addCalendarMonths, formatAssignmentDateLabel } from "@/lib/domain/assignment-renewal";
import { formatPlanTerm } from "@/lib/subscription-options/display";

function resolveAdvanceBaseDate(nextDueDate: Date | null): Date {
  if (nextDueDate) {
    return nextDueDate;
  }
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  return today;
}

export function MarkPaidOptionalNextDueField({
  intervalMonths,
  nextDueDate,
  labelClassName = "font-medium text-zinc-600 dark:text-zinc-400",
  inputClassName = "mt-0.5 block w-full min-w-[10rem] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950",
}: {
  intervalMonths: number;
  nextDueDate: Date | null;
  labelClassName?: string;
  inputClassName?: string;
}) {
  const baseDate = resolveAdvanceBaseDate(nextDueDate);
  const autoNextDue = addCalendarMonths(baseDate, intervalMonths);
  const autoLabel = formatAssignmentDateLabel(autoNextDue);

  return (
    <label className="block text-xs">
      <span className={labelClassName}>Next due after payment (optional)</span>
      <input
        name="nextDueOverride"
        type="date"
        className={inputClassName}
        aria-describedby="next-due-hint"
      />
      <span id="next-due-hint" className="mt-0.5 block text-zinc-500 dark:text-zinc-400">
        Leave blank to advance by {formatPlanTerm(intervalMonths)} to {autoLabel}
        {nextDueDate ? ` (from ${formatAssignmentDateLabel(nextDueDate)})` : " (first period)"}.
      </span>
    </label>
  );
}
