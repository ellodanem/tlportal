import { redirect } from "next/navigation";

import {
  changeOwnPasswordAction,
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
} from "@/app/admin/users/actions";
import { getSession } from "@/lib/auth/get-session";
import { getDefaultSuperAdminEmail, isSuperAdminEmail } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!isSuperAdminEmail(session.email)) {
    redirect("/admin");
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Admin / Settings / Users</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">User management</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Manage admin users, reset passwords, and keep access secure. Default super admin:{" "}
          <span className="font-medium">{getDefaultSuperAdminEmail()}</span>.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Change your password</h2>
        <form action={changeOwnPasswordAction} className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            type="password"
            name="currentPassword"
            required
            minLength={8}
            placeholder="Current password"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <input
            type="password"
            name="newPassword"
            required
            minLength={8}
            placeholder="New password (min 8 chars)"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Change password
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Create or update user</h2>
        <form action={createUserAction} className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            type="text"
            name="name"
            placeholder="Name (optional)"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <input
            type="email"
            name="email"
            required
            placeholder="Email"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <input
            type="password"
            name="password"
            required
            minLength={8}
            placeholder="Temporary password"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Save user
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Current users</h2>
        <div className="mt-4 space-y-3">
          {users.map((user) => {
            const isDefaultSuperAdmin = isSuperAdminEmail(user.email);
            return (
              <div
                key={user.id}
                className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-950/40 md:grid-cols-[1fr_auto_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {user.name || user.email}
                    {isDefaultSuperAdmin ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                        Super admin
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
                </div>
                <form action={resetUserPasswordAction} className="flex gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={8}
                    placeholder="Reset password"
                    className="w-44 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Reset
                  </button>
                </form>
                <form action={deleteUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button
                    type="submit"
                    disabled={isDefaultSuperAdmin || session.sub === user.id}
                    className="rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-950/20"
                  >
                    Delete
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
