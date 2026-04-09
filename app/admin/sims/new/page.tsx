import Link from "next/link";

export default function NewSimPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">New SIM</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          The add-SIM form is not ready yet. Manage existing SIMs from the list below.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/admin/sims" className="text-emerald-700 hover:underline dark:text-emerald-400">
            ← SIMs
          </Link>
        </p>
      </div>
    </div>
  );
}
