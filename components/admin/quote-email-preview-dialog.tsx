"use client";

import { useFormStatus } from "react-dom";

import type { SendQuoteEmailState } from "@/app/admin/quotes/actions";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
    >
      {pending ? "Sending…" : "Send email"}
    </button>
  );
}

export function QuoteEmailPreviewDialog({
  open,
  quoteNumber,
  attachmentName,
  to,
  cc,
  bcc,
  subject,
  bodyText,
  quotePayloadJson,
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
  quoteNumber: string;
  attachmentName: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyText: string;
  quotePayloadJson: string;
  sendState: SendQuoteEmailState;
  sendAction: (formData: FormData) => void;
  onToChange: (value: string) => void;
  onCcChange: (value: string) => void;
  onBccChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onBodyTextChange: (value: string) => void;
  onBack: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-email-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <h2 id="quote-email-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Email quote preview
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Review and tweak the message before sending. The PDF for <strong>{quoteNumber}</strong> is attached
          automatically.
        </p>

        <form action={sendAction} className="mt-5 flex flex-col gap-4">
          <input type="hidden" name="quotePayloadJson" value={quotePayloadJson} />

          <div>
            <label htmlFor="quote-email-to" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              To
            </label>
            <input
              id="quote-email-to"
              name="to"
              type="email"
              required
              value={to}
              onChange={(e) => onToChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="quote-email-cc" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Cc <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="quote-email-cc"
              name="cc"
              type="text"
              value={cc}
              onChange={(e) => onCcChange(e.target.value)}
              placeholder="one@example.com, two@example.com"
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Comma-separated, up to 3 addresses.</p>
          </div>

          <div>
            <label htmlFor="quote-email-bcc" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Bcc <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="quote-email-bcc"
              name="bcc"
              type="text"
              value={bcc}
              onChange={(e) => onBccChange(e.target.value)}
              placeholder="one@example.com, two@example.com"
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Comma-separated, up to 3 addresses.</p>
          </div>

          <div>
            <label htmlFor="quote-email-subject" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Subject
            </label>
            <input
              id="quote-email-subject"
              name="subject"
              type="text"
              required
              maxLength={200}
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="quote-email-body" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Message
            </label>
            <textarea
              id="quote-email-body"
              name="bodyText"
              required
              rows={10}
              maxLength={8000}
              value={bodyText}
              onChange={(e) => onBodyTextChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
            <span className="font-medium">Attachment:</span> {attachmentName}
          </div>

          {sendState.error ? (
            <p
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {sendState.error}
            </p>
          ) : null}

          {sendState.ok && sendState.message ? (
            <p
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
              role="status"
            >
              {sendState.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <SendButton />
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← Back to quote
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
