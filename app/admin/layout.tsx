import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin-sidebar";
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
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="min-w-0 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="hidden sm:inline">Signed in as </span>
              <span className="truncate font-medium text-zinc-800 dark:text-zinc-200" title={user?.email ?? session.email}>
                {user?.email ?? session.email}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <Link
                href="/"
                className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Public site
              </Link>
              <SignOutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
