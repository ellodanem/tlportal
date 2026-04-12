"use client";

import { useCallback, useState } from "react";

export function CopyRegisterLinkButton() {
  const [label, setLabel] = useState("Copy link");

  const copy = useCallback(async () => {
    const url = `${window.location.origin}/register`;
    try {
      await navigator.clipboard.writeText(url);
      setLabel("Copied!");
      window.setTimeout(() => setLabel("Copy link"), 2000);
    } catch {
      setLabel("Copy failed");
      window.setTimeout(() => setLabel("Copy link"), 2000);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="ml-1 inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
    >
      {label}
    </button>
  );
}
