"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { importSimsFromOneNce } from "@/app/admin/sims/actions";

export function ImportSimsButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setMessage(null);
          setPending(true);
          const r = await importSimsFromOneNce();
          setPending(false);
          if (!r.ok) {
            setMessage(r.error);
            return;
          }
          setMessage(`Imported / updated ${r.imported} SIM(s) from 1NCE.`);
          router.refresh();
        }}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
      >
        {pending ? "Importing…" : "Import SIMs from 1NCE"}
      </button>
      {message ? (
        <p
          className={`max-w-sm text-right text-xs ${message.startsWith("Imported") ? "text-zinc-600 dark:text-zinc-400" : "text-red-600 dark:text-red-400"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
