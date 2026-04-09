"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { syncCustomerToInvoiless } from "@/app/admin/customers/actions";

export function SyncInvoilessButton({
  customerId,
  hasInvoilessId,
}: {
  customerId: string;
  hasInvoilessId: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncCustomerToInvoiless(customerId);
      if (result.ok) {
        router.refresh();
        setMessage({
          ok: true,
          text: hasInvoilessId ? "Updated in Invoiless." : "Created in Invoiless and linked.",
        });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {pending ? "Syncing…" : hasInvoilessId ? "Push changes to Invoiless" : "Sync to Invoiless"}
      </button>
      {message ? (
        <p
          className={
            message.ok
              ? "text-xs text-emerald-700 dark:text-emerald-400"
              : "text-xs text-red-600 dark:text-red-400"
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
