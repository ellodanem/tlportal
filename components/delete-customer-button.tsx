"use client";

import { deleteCustomer } from "@/app/admin/customers/actions";

export function DeleteCustomerButton({ customerId }: { customerId: string }) {
  return (
    <form
      action={deleteCustomer}
      onSubmit={(e) => {
        if (!window.confirm("Delete this customer? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={customerId} />
      <button
        type="submit"
        className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        Delete customer
      </button>
    </form>
  );
}
