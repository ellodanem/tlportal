"use client";

import { useMemo, useState } from "react";

export type QuickSendCustomer = {
  id: string;
  name: string;
  firstName: string;
  email: string | null;
  phone: string | null;
};

export function QuickCustomerPicker({
  customers,
  selected,
  onSelect,
  searchHint,
  emptyHint,
}: {
  customers: QuickSendCustomer[];
  selected: QuickSendCustomer | null;
  onSelect: (c: QuickSendCustomer | null) => void;
  searchHint: string;
  emptyHint: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false) ||
          (c.phone?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8);
  }, [customers, query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950">
        <span className="text-zinc-900 dark:text-zinc-100">
          {selected.name}
          {selected.email ? <span className="text-zinc-500"> · {selected.email}</span> : null}
          {selected.phone ? <span className="text-zinc-500"> · {selected.phone}</span> : null}
        </span>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
          className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={searchHint}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="text-zinc-900 dark:text-zinc-100">{c.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim() && matches.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{emptyHint}</p>
      ) : null}
    </div>
  );
}
