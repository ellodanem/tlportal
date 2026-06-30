"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import {
  createExpenseCategoryAction,
  toggleExpenseCategoryAction,
  type CategoryFormState,
} from "@/app/admin/expenses/actions";

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Adding…" : "Add category"}
    </button>
  );
}

export function ExpenseCategoriesClient({
  categories,
}: {
  categories: { id: string; name: string; description: string | null; isActive: boolean; expenseCount: number }[];
}) {
  const [createState, createAction] = useActionState(createExpenseCategoryAction, {} as CategoryFormState);
  const [toggleState, toggleAction] = useActionState(toggleExpenseCategoryAction, {} as CategoryFormState);

  return (
    <div className="flex flex-col gap-8">
      <form action={createAction} className="flex max-w-lg flex-col gap-3 rounded-xl border p-4">
        <p className="font-medium">Add category</p>
        <input
          name="name"
          required
          placeholder="Category name"
          className="rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
        />
        <input
          name="description"
          placeholder="Description (optional)"
          className="rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
        />
        {createState.error ? <p className="text-sm text-red-700">{createState.error}</p> : null}
        {createState.ok && createState.message ? <p className="text-sm text-emerald-800">{createState.message}</p> : null}
        <AddButton />
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-600 dark:bg-zinc-950">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Expenses</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.description ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{c.expenseCount}</td>
                <td className="px-4 py-3">{c.isActive ? "Active" : "Hidden"}</td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleAction} className="inline">
                    <input type="hidden" name="categoryId" value={c.id} />
                    <input type="hidden" name="isActive" value={c.isActive ? "false" : "true"} />
                    <button type="submit" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                      {c.isActive ? "Hide" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toggleState.error ? <p className="text-sm text-red-700">{toggleState.error}</p> : null}
      <Link href="/admin/expenses" className="text-sm font-medium text-zinc-600 hover:underline">
        ← Expenses
      </Link>
    </div>
  );
}
