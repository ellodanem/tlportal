import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Track Lucia
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage customers, inventory, SIMs, and billing from here.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Product</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <Link href="/admin/customers" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Customers
            </Link>
            <span className="text-zinc-500"> — list, create, edit; sync to Invoiless when configured.</span>
          </li>
          <li className="text-zinc-500">Device models &amp; devices — next.</li>
          <li className="text-zinc-500">SIMs (1NCE) — next.</li>
          <li className="text-zinc-500">Service assignments &amp; billing — next.</li>
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Integration stubs</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GET /api/integrations/invoiless/customers</code>
          </li>
          <li>
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GET /api/integrations/invoiless/invoices</code>
          </li>
          <li>
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GET /api/integrations/once/sims</code>
          </li>
          <li>
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GET /api/health</code>
          </li>
        </ul>
      </section>

      <p className="text-sm text-zinc-500">
        <Link href="/" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Public home
        </Link>
      </p>
    </div>
  );
}
