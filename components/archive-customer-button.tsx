"use client";

import { archiveCustomerAction, unarchiveCustomerAction } from "@/app/admin/customers/actions";

export function ArchiveCustomerButton({
  customerId,
  displayName,
  openAssignmentCount,
}: {
  customerId: string;
  displayName: string;
  openAssignmentCount: number;
}) {
  const assignmentNote =
    openAssignmentCount > 0
      ? ` This will end ${openAssignmentCount} active service assignment${openAssignmentCount === 1 ? "" : "s"} (devices stay with the customer).`
      : "";

  return (
    <form
      action={archiveCustomerAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Archive ${displayName}? They will be hidden from the active customer list and will no longer receive billing reminders.${assignmentNote}`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={customerId} />
      <button
        type="submit"
        className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-950/40"
      >
        Archive customer
      </button>
    </form>
  );
}

export function UnarchiveCustomerButton({ customerId, displayName }: { customerId: string; displayName: string }) {
  return (
    <form
      action={unarchiveCustomerAction}
      onSubmit={(e) => {
        if (!window.confirm(`Restore ${displayName} from the archive?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={customerId} />
      <button
        type="submit"
        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
      >
        Restore from archive
      </button>
    </form>
  );
}
