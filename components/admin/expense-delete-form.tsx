"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { deleteExpenseAction, type DeleteExpenseState } from "@/app/admin/expenses/actions";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm font-medium text-red-700 hover:underline disabled:opacity-60 dark:text-red-400"
    >
      {pending ? "Deleting…" : "Delete expense"}
    </button>
  );
}

export function ExpenseDeleteForm({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [state, action] = useActionState(deleteExpenseAction, {} as DeleteExpenseState);

  useEffect(() => {
    if (state.ok) {
      router.push("/admin/expenses");
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form action={action} className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <input type="hidden" name="expenseId" value={expenseId} />
      <DeleteButton />
      {state.error ? <p className="mt-1 text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}
