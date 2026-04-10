import Link from "next/link";

import { InvoicesTableClient } from "@/components/admin/invoices/invoices-table-client";
import { customerDisplayName } from "@/lib/admin/customer-list";
import { prisma } from "@/lib/db";
import { fetchInvoicesPage, isInvoilessConfigured } from "@/lib/invoiless/invoices-list";

type Props = { searchParams: Promise<{ page?: string; q?: string; limit?: string }> };

const INVOILESS_APP = "https://invoiless.com";

const ALLOWED_LIMITS = [25, 50, 100] as const;

function normalizeLimit(raw: string | undefined): number {
  const n = parseInt(raw ?? "50", 10) || 50;
  return (ALLOWED_LIMITS as readonly number[]).includes(n) ? n : 50;
}

export default async function AdminInvoicesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const limit = normalizeLimit(sp.limit);
  const q = (sp.q ?? "").trim();

  const invoilessConfigured = isInvoilessConfigured();

  const customers = await prisma.customer.findMany({
    where: { invoilessCustomerId: { not: null } },
    select: { id: true, company: true, firstName: true, lastName: true, invoilessCustomerId: true },
  });
  const tlCustomerByInvoilessId: Record<string, { portalId: string; name: string }> = {};
  for (const c of customers) {
    if (c.invoilessCustomerId) {
      tlCustomerByInvoilessId[c.invoilessCustomerId] = {
        portalId: c.id,
        name: customerDisplayName(c),
      };
    }
  }

  let rows: Awaited<ReturnType<typeof fetchInvoicesPage>>["rows"] = [];
  let pagination = { page, limit, totalPages: 1, totalItems: 0 };
  let loadError: string | null = null;

  if (invoilessConfigured) {
    try {
      const result = await fetchInvoicesPage({ page, limit, search: q || undefined });
      rows = result.rows;
      pagination = result.pagination;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Failed to load invoices from Invoiless.";
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <span className="text-zinc-400 dark:text-zinc-500">Admin</span>
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Invoices</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Invoices</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Read-only mirror of Invoiless. Build and send invoices there; use this view to scan status, totals, and jump
          to linked customers in TL Portal.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">Could not load invoices</p>
          <p className="mt-1 font-mono text-xs opacity-90">{loadError}</p>
        </div>
      ) : null}

      <InvoicesTableClient
        rows={rows}
        tlCustomerByInvoilessId={tlCustomerByInvoilessId}
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        limit={pagination.limit}
        search={q}
        invoilessConfigured={invoilessConfigured}
        invoilessDashboardUrl={INVOILESS_APP}
      />

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/admin" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Dashboard
        </Link>
      </p>
    </div>
  );
}
