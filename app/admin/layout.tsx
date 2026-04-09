import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/auth/get-session";
import { prisma } from "@/lib/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { email: true, name: true },
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/admin" className="font-semibold text-zinc-900 dark:text-zinc-50">
              TL Portal
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              <Link
                href="/admin"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/customers"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Customers
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="truncate" title={user?.email ?? session.email}>
              {user?.email ?? session.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
