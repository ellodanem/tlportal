import Link from "next/link";

type Props = { searchParams: Promise<{ session_id?: string }> };

export default async function PayThanksPage({ searchParams }: Props) {
  const { session_id: sessionId } = await searchParams;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Track Lucia
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Payment received</h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Thank you. Your card has been saved and your subscription is being set up. You will receive a receipt
          from Stripe by email if one is configured on your account.
        </p>
        {sessionId ? (
          <p className="mt-3 font-mono text-xs text-zinc-500">Reference: {sessionId}</p>
        ) : null}
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          You can close this window. If you have questions about your service, contact Track Lucia support.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex w-fit rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600"
        >
          Track Lucia home
        </Link>
      </main>
    </div>
  );
}
