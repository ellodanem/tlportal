import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { email: true, name: true },
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Track Lucia
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Admin</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as {user?.email ?? session.email}
          {user?.name ? ` (${user.name})` : ""}
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Integration stubs</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
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

      <SignOutButton />

      <p className="text-sm text-zinc-500">
        <Link href="/" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Home
        </Link>
      </p>
    </div>
  );
}
