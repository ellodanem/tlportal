import Link from "next/link";

import { createProposal } from "@/app/admin/proposals/actions";

export default function NewProposalPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/proposals" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
          ← Proposals
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New proposal</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          We will create a draft with default summary text, three sample line items (prices at zero), three visual
          placeholder sections, and standard terms you can edit before exporting PDF.
        </p>
      </div>

      <form action={createProposal} className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="submit"
          className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          Create draft
        </button>
        <Link
          href="/admin/proposals"
          className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Cancel
        </Link>
      </form>
    </div>
  );
}
