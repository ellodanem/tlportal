"use client";

import { useFormStatus } from "react-dom";

import type { SendInvoiceEmailState } from "@/app/admin/tl-invoices/actions";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send email"}
    </button>
  );
}

export function InvoiceEmailPreviewDialog({
  open,
  invoiceId,
  invoiceNumber,
  to,
  cc,
  bcc,
  subject,
  bodyText,
  invoicePayloadJson,
  sendState,
  sendAction,
  onToChange,
  onCcChange,
  onBccChange,
  onSubjectChange,
  onBodyTextChange,
  onBack,
}: {
  open: boolean;
  invoiceId: string;
  invoiceNumber: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
  invoicePayloadJson: string;
  sendState: SendInvoiceEmailState;
  sendAction: (formData: FormData) => void;
  onToChange: (v: string) => void;
  onCcChange: (v: string) => void;
  onBccChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  onBodyTextChange: (v: string) => void;
  onBack: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Email invoice preview</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Sending finalizes invoice <strong>{invoiceNumber}</strong> and attaches the PDF.
        </p>
        <form action={sendAction} className="mt-5 flex flex-col gap-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="invoicePayloadJson" value={invoicePayloadJson} />
          <div>
            <label className="block text-sm font-medium">To</label>
            <input
              name="to"
              type="email"
              required
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Cc</label>
            <input
              name="cc"
              value={cc}
              onChange={(e) => onCcChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Bcc</label>
            <input
              name="bcc"
              value={bcc}
              onChange={(e) => onBccChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Subject</label>
            <input
              name="subject"
              required
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Message</label>
            <textarea
              name="bodyText"
              required
              rows={8}
              value={bodyText}
              onChange={(e) => onBodyTextChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          {sendState.error ? <p className="text-sm text-red-700">{sendState.error}</p> : null}
          {sendState.ok && sendState.message ? <p className="text-sm text-emerald-800">{sendState.message}</p> : null}
          <div className="flex gap-3">
            <SendButton />
            <button type="button" onClick={onBack} className="text-sm text-zinc-600">
              ← Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
