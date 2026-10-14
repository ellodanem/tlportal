import Link from "next/link";
import type { ReactNode } from "react";

type CommercialCreateShellProps = {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  panelTitle: string;
  panelDescription: string;
  panelItems: { label: string; value: string }[];
  children: ReactNode;
};

export function CommercialCreateShell({ backHref, backLabel, eyebrow, title, description, status = "Draft", panelTitle, panelDescription, panelItems, children }: CommercialCreateShellProps) {
  return <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40 sm:p-5">
    <div className="mb-5 flex flex-col gap-3 border-b border-zinc-200 px-1 pb-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><Link href={backHref} className="text-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label={`Back to ${backLabel}`}>×</Link><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{title}</p><p className="text-xs text-zinc-500">{eyebrow}</p></div></div><span className="w-fit rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{status}</span></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]"><section className="min-w-0 rounded-xl bg-white p-3 dark:bg-zinc-900 sm:p-5"><div className="mb-6"><p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">{eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">{title}</h1><p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">{description}</p></div>{children}</section><aside className="h-fit rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900 lg:sticky lg:top-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Workflow guide</p><h2 className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">{panelTitle}</h2><p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{panelDescription}</p><dl className="mt-6 divide-y divide-zinc-100 dark:divide-zinc-800">{panelItems.map((item) => <div key={item.label} className="py-3 first:pt-0 last:pb-0"><dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{item.label}</dt><dd className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{item.value}</dd></div>)}</dl></aside></div>
  </div>;
}
