import Link from "next/link";

import { loadBillingCutoverPageData } from "@/app/admin/billing-cutover/actions";
import { InvoilessBackfillForm } from "@/components/admin/billing-cutover-panel";
import { isInvoilessLegacyUiEnabled, isNativeBillingPrimary } from "@/lib/domain/native-billing-cutover";

export default async function BillingCutoverPage() {
  const [status, nativePrimary, legacyUi] = await Promise.all([
    loadBillingCutoverPageData(),
    Promise.resolve(isNativeBillingPrimary()),
    Promise.resolve(isInvoilessLegacyUiEnabled()),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Billing cutover</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Billing cutover
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Native billing is the default product path. Import historical Invoiless invoices into TL Portal for unified AR
          and reporting, then retire the legacy Invoiless UI when you are ready.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Current mode</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Native billing primary</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-50">{nativePrimary ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Invoiless legacy UI</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-50">
              {legacyUi ? "Enabled" : "Hidden"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Invoiless API configured</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-50">
              {status.configured ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-400">Imported invoices</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-50">
              {status.importedCount.toLocaleString()} / {status.nativeInvoiceCount.toLocaleString()} total native
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          Env: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">NATIVE_BILLING_PRIMARY</code> (default on),{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">INVOILESS_LEGACY_UI=true</code> to show legacy
          Invoiless admin, <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">INVOILESS_STRIPE_MIRROR</code>{" "}
          auto-off when native is primary.
        </p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Import from Invoiless</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pulls one batch (25 invoices) per run from the Invoiless API into native{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">Invoice</code> rows with kind{" "}
          <em>Invoiless (imported)</em>. Retainers are skipped — recreate those as{" "}
          <Link href="/admin/recurring-invoices" className="font-medium text-emerald-700 underline dark:text-emerald-400">
            recurring schedules
          </Link>
          . Run repeatedly until no more pages remain.
        </p>
        {!status.configured ? (
          <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
            Set <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">INVOILESS_API_KEY</code> to import
            history, then remove the key when cutover is complete.
          </p>
        ) : (
          <div className="mt-4">
            <InvoilessBackfillForm startPage={1} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Where to work now</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            <Link href="/admin/tl-invoices" className="font-medium text-emerald-700 underline dark:text-emerald-400">
              Invoices
            </Link>{" "}
            — create, send, and record payments for cash/cheque/bank customers.
          </li>
          <li>
            <Link href="/admin/recurring-invoices" className="font-medium text-emerald-700 underline dark:text-emerald-400">
              Recurring
            </Link>{" "}
            — monthly/quarterly bills for non-card payers.
          </li>
          <li>
            <Link href="/admin/reports" className="font-medium text-emerald-700 underline dark:text-emerald-400">
              Reports
            </Link>{" "}
            — AR aging, revenue, and expenses after import.
          </li>
          {legacyUi ? (
            <li>
              <Link href="/admin/invoices?legacy=1" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                Invoiless (legacy)
              </Link>{" "}
              — read-only live list while legacy UI is enabled.
            </li>
          ) : null}
        </ul>
      </section>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/admin/settings" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Settings
        </Link>
      </p>
    </div>
  );
}
