"use client";

import { archiveCustomerNew, deleteCustomerNew } from "@/app/admin/customer-new/actions";

export function ArchiveCustomerNewButton({
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
      action={archiveCustomerNew}
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
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 sm:w-auto dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-950/40"
      >
        Archive customer
      </button>
    </form>
  );
}

export function DeleteCustomerNewButton({ customerId }: { customerId: string }) {
  return (
    <form
      action={deleteCustomerNew}
      onSubmit={(e) => {
        if (!window.confirm("Delete this customer? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={customerId} />
      <button
        type="submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 sm:w-auto dark:border-red-900 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        Delete customer
      </button>
    </form>
  );
}
