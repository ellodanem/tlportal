"use client";

import { restoreCustomerNew } from "@/app/admin/customer-new/actions";

export function RestoreCustomerButton({ customerId, displayName }: { customerId: string; displayName: string }) {
  return (
    <form
      action={restoreCustomerNew}
      onSubmit={(e) => {
        if (!window.confirm(`Restore ${displayName} from the archive?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={customerId} />
      <button
        type="submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 sm:w-auto @lg:min-h-10 dark:bg-emerald-600 dark:hover:bg-emerald-500"
      >
        Restore from archive
      </button>
    </form>
  );
}
