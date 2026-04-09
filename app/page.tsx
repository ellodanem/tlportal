import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="max-w-lg text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Track Lucia
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">TL Portal</h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Admin hub for customers, devices, SIMs (1NCE), and billing (Invoiless). Auth and integration API
          routes are available.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
          <Link
            href="/login"
            className="rounded-full bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Admin login
          </Link>
          <Link href="/api/health" className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400">
            API health
          </Link>
        </div>
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
          Local DB:{" "}
          <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            docker compose up -d
          </code>{" "}
          then{" "}
          <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            npm run db:migrate
          </code>
          .
        </p>
      </main>
    </div>
  );
}
