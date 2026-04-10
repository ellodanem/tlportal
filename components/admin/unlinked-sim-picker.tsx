"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";

import { type UnlinkedSimRow, filterUnlinkedSims } from "@/lib/admin/unlinked-sim-filter";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

export function UnlinkedSimPicker({ sims }: { sims: UnlinkedSimRow[] }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterUnlinkedSims(sims, deferredQuery),
    [sims, deferredQuery],
  );

  const selected = selectedId ? sims.find((s) => s.id === selectedId) : null;

  if (sims.length === 0) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">No unlinked SIMs available.</p>
    );
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name="simCardId" value={selectedId ?? ""} />

      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <div className="min-w-0 font-mono text-xs text-zinc-800 dark:text-zinc-200">
            <span className="font-medium text-emerald-900 dark:text-emerald-200">Selected:</span>{" "}
            <span className="break-all">{selected.iccid}</span>
            {selected.msisdn?.trim() ? (
              <span className="text-zinc-600 dark:text-zinc-400"> · {selected.msisdn.trim()}</span>
            ) : null}
            {selected.label?.trim() ? (
              <span className="block text-zinc-600 dark:text-zinc-400">Label: {selected.label.trim()}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            onClick={() => {
              setSelectedId(null);
              setQuery("");
            }}
          >
            Clear SIM
          </button>
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor={`${listId}-search`}>
          Filter SIMs (optional)
        </label>
        <input
          id={`${listId}-search`}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by ICCID, MSISDN, or label…"
          className={`${inputClass} mt-1`}
          aria-controls={listId}
          aria-describedby={`${listId}-hint`}
        />
        <p id={`${listId}-hint`} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Only SIMs not already on a device (or an open service) are listed. Type to narrow, click a row to link, or leave
          unset for no SIM.
        </p>
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label="Unlinked SIM cards"
        className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/40"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No unlinked SIMs match &quot;{query.trim()}&quot;.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedId === s.id}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-white dark:hover:bg-zinc-800 ${
                    selectedId === s.id ? "bg-emerald-100/80 dark:bg-emerald-950/40" : ""
                  }`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="font-mono text-xs text-zinc-900 dark:text-zinc-50">{s.iccid}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {s.msisdn?.trim() ? `${s.msisdn.trim()}` : "—"}
                    {s.label?.trim() ? ` · ${s.label.trim()}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
