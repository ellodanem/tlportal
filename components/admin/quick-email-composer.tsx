"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { sendQuickEmailAction, type QuickEmailState } from "@/app/admin/message-templates/actions";

export type QuickEmailCustomer = { id: string; name: string; email: string };

const initial: QuickEmailState = { error: null };

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? "Sending…" : "Send email"}
    </button>
  );
}

export function QuickEmailComposer({
  customers,
  smtpReady,
}: {
  customers: QuickEmailCustomer[];
  smtpReady: boolean;
}) {
  const [state, action] = useActionState(sendQuickEmailAction, initial);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<QuickEmailCustomer | null>(null);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers, query]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={selected?.id ?? ""} />

      <div className="relative">
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">To (customer)</label>
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950">
            <span className="text-zinc-900 dark:text-zinc-100">
              {selected.name} <span className="text-zinc-500">· {selected.email}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search by name or email…"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
            {open && matches.length > 0 ? (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(c);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span className="text-zinc-900 dark:text-zinc-100">{c.name}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{c.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {open && query.trim() && matches.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">No customers with an email match.</p>
            ) : null}
          </>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">Subject</label>
        <input
          type="text"
          name="subject"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">Message</label>
        <textarea
          name="body"
          rows={7}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      {!smtpReady ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          SMTP is not configured — set mail settings under Admin → Settings before sending.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SendButton disabled={!smtpReady || !selected} />
        {state.error ? (
          <span className="text-sm text-rose-700 dark:text-rose-400" role="alert">
            {state.error}
          </span>
        ) : null}
        {state.ok && state.message ? (
          <span className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
