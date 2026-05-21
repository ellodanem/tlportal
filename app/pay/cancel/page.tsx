import Link from "next/link";

export default function PayCancelPage() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Track Lucia</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Payment canceled</h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          No charge was made. You can use the payment link from Track Lucia again when you are ready.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex w-fit rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900"
        >
          Track Lucia home
        </Link>
      </main>
    </div>
  );
}
