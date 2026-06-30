"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  markQuoteSentAction,
  saveQuoteAction,
  sendQuoteEmailAction,
  type MarkQuoteSentState,
  type SaveQuoteState,
  type SendQuoteEmailState,
} from "@/app/admin/quotes/actions";
import { QuoteEmailPreviewDialog } from "@/components/admin/quote-email-preview-dialog";
import {
  defaultQuoteEmailBody,
  defaultQuoteEmailSubject,
} from "@/lib/billing/quote-email-body";
import { DEFAULT_QUOTE_EMAIL_BCC } from "@/lib/billing/quote-email-recipients";
import type { QuoteRequestPayload } from "@/lib/billing/quote-payload";

export type QuoteCustomerOption = {
  id: string;
  label: string;
  email: string | null;
  billToLines: string[];
};

export type QuoteFormInitial = {
  quoteId: string;
  status: string;
  number: string | null;
  customerId: string | null;
  clientName: string;
  quoteDate: string;
  validUntil: string;
  currency: string;
  notes: string;
  lines: { description: string; quantity: string; unitPrice: string }[];
  convertedInvoiceId: string | null;
};

type LineRow = {
  id: number;
  description: string;
  quantity: string;
  unitPrice: string;
};

function todayDateInputValue(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToDateInput(baseYmd: string, days: number): string {
  const d = new Date(`${baseYmd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DEFAULT_LINES: Omit<LineRow, "id">[] = [
  {
    description: "Track Lucia – Wired GPS device (supply & configuration, per vehicle)",
    quantity: "1",
    unitPrice: "0",
  },
  {
    description: "Software subscription (per vehicle / month, incl. SIM & hosting)",
    quantity: "1",
    unitPrice: "0",
  },
  {
    description: "Fleet installation — standard on-site visit (per vehicle)",
    quantity: "1",
    unitPrice: "0",
  },
];

const initialSendState: SendQuoteEmailState = {};
const initialSaveState: SaveQuoteState = {};
const initialMarkSentState: MarkQuoteSentState = {};

export function QuoteGeneratorForm({
  customers,
  initial,
  readOnly = false,
}: {
  customers: QuoteCustomerOption[];
  initial?: QuoteFormInitial;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const lineIdRef = useRef(0);
  const quoteId = initial?.quoteId ?? "";
  const assignedNumber = initial?.number ?? null;
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [quoteDate, setQuoteDate] = useState(initial?.quoteDate ?? todayDateInputValue);
  const [validUntil, setValidUntil] = useState(
    initial?.validUntil ?? addDaysToDateInput(todayDateInputValue(), 14),
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "XCD");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<LineRow[]>(() => {
    const source = initial?.lines?.length
      ? initial.lines
      : DEFAULT_LINES;
    return source.map((row) => ({ ...row, id: lineIdRef.current++ }));
  });
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [quotePayloadJson, setQuotePayloadJson] = useState("");
  const [sendState, sendAction] = useActionState(sendQuoteEmailAction, initialSendState);
  const [saveState, saveAction] = useActionState(saveQuoteAction, initialSaveState);
  const [markSentState, markSentAction] = useActionState(markQuoteSentAction, initialMarkSentState);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const displayNumber = assignedNumber ?? "Draft";
  const attachmentName = `quote-${displayNumber.replace(/[^\w.-]+/g, "_").slice(0, 40)}.pdf`;
  const isConverted = Boolean(initial?.convertedInvoiceId);

  useEffect(() => {
    if (sendState.ok) {
      router.refresh();
    }
  }, [sendState.ok, router]);

  useEffect(() => {
    if (markSentState.ok) {
      router.refresh();
    }
  }, [markSentState.ok, router]);

  useEffect(() => {
    if (saveState.ok && saveState.next) {
      router.push(saveState.next);
      router.refresh();
    }
  }, [saveState, router]);

  function addLine() {
    setLines((prev) => [...prev, { id: lineIdRef.current++, description: "", quantity: "1", unitPrice: "0" }]);
  }

  function removeLine(id: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  }

  function updateLine(id: number, patch: Partial<Omit<LineRow, "id">>) {
    setLines((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function buildPayload(): { payload: QuoteRequestPayload; greetingName: string } | { error: string } {
    const lineItems = lines
      .map((row) => ({
        description: row.description.trim(),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
      }))
      .filter((row) => row.description.length > 0);

    if (!lineItems.length) {
      return { error: "Add at least one line item with a description." };
    }

    for (const row of lineItems) {
      if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
        return { error: "Each line item needs a quantity greater than zero." };
      }
      if (!Number.isFinite(row.unitPrice) || row.unitPrice < 0) {
        return { error: "Each line item needs a valid unit price." };
      }
    }

    const billToLines =
      selectedCustomer?.billToLines ?? (clientName.trim() ? [clientName.trim()] : null);

    if (!billToLines?.length) {
      return { error: "Choose a customer or enter a client name." };
    }

    const greetingName =
      selectedCustomer?.label?.trim() || clientName.trim() || billToLines[0] || "there";

    return {
      payload: {
        customerId: customerId || null,
        billToLines,
        quoteNumber: assignedNumber ?? "Draft",
        quoteDate,
        validUntil,
        currency,
        notes: notes.trim() || null,
        lineItems,
      },
      greetingName,
    };
  }

  async function handleDownload() {
    setError(null);
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }

    setDownloading(true);
    try {
      const useDbPdf = Boolean(quoteId);
      const url = useDbPdf ? `/api/admin/quotes/${quoteId}/pdf` : "/api/admin/quotes/pdf";
      const init: RequestInit = useDbPdf
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(built.payload),
          };

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 45_000);
      const res = await fetch(url, { ...init, signal: controller.signal });
      window.clearTimeout(timeout);

      if (!res.ok) {
        let message = `Could not generate PDF (${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* ignore */
        }
        setError(message);
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      a.href = blobUrl;
      a.download = match?.[1] ?? attachmentName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("PDF generation timed out — try again or use fewer line items.");
      } else {
        setError("Network error — try again.");
      }
    } finally {
      setDownloading(false);
    }
  }

  function openEmailPreview() {
    if (!quoteId) {
      setError("Save the draft first — marking sent assigns a TL-Q number.");
      return;
    }

    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }

    setError(null);
    const { payload, greetingName } = built;
    const draft = defaultQuoteEmailBody({
      greetingName,
      quoteNumber: payload.quoteNumber,
      validUntilYmd: payload.validUntil,
    });

    setQuotePayloadJson(JSON.stringify(payload));
    setEmailTo(selectedCustomer?.email?.trim() ?? "");
    setEmailCc("");
    setEmailBcc(DEFAULT_QUOTE_EMAIL_BCC);
    setEmailSubject(defaultQuoteEmailSubject(payload.quoteNumber));
    setEmailBody(draft.text);
    setEmailOpen(true);
  }

  function submitSaveDraft(formData: FormData) {
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setError(null);
    formData.set("quotePayloadJson", JSON.stringify(built.payload));
    if (quoteId) {
      formData.set("quoteId", quoteId);
    }
    saveAction(formData);
  }

  function submitMarkSent(formData: FormData) {
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    if (!quoteId) {
      setError("Save the draft first, then mark as sent.");
      return;
    }
    setError(null);
    formData.set("quotePayloadJson", JSON.stringify(built.payload));
    formData.set("quoteId", quoteId);
    markSentAction(formData);
  }

  const fieldsDisabled = readOnly || isConverted;

  return (
    <>
      <div className="flex max-w-3xl flex-col gap-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
          <p className="font-medium">Native TL quotes</p>
          <p className="mt-1 text-emerald-900/90 dark:text-emerald-200/90">
            Save drafts in TL Portal, email with a TL-Q number, and convert to a native invoice. For full sales decks,
            use{" "}
            <Link href="/admin/proposals/new" className="font-semibold underline underline-offset-2">
              Proposals
            </Link>
            .
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="customerId" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Customer <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <select
              id="customerId"
              value={customerId}
              disabled={fieldsDisabled}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setClientName("");
              }}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="">Select or enter name below…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.email ? ` (${c.email})` : ""}
                </option>
              ))}
            </select>
            {selectedCustomer ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Bill to: {selectedCustomer.billToLines.join(" · ")}
                {selectedCustomer.email ? ` · ${selectedCustomer.email}` : " · no email on file"}
              </p>
            ) : null}
          </div>

          {!customerId ? (
            <div className="sm:col-span-2">
              <label htmlFor="clientName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Client name
              </label>
              <input
                id="clientName"
                type="text"
                value={clientName}
                disabled={fieldsDisabled}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Company or contact name"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          ) : null}

          <div>
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Quote number</span>
            <p className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
              {assignedNumber ?? (
                <span className="text-zinc-500 dark:text-zinc-400">Assigned when you mark sent or email (TL-Q-…)</span>
              )}
            </p>
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Currency
            </label>
            <input
              id="currency"
              type="text"
              maxLength={8}
              value={currency}
              disabled={fieldsDisabled}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="quoteDate" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Quote date
            </label>
            <input
              id="quoteDate"
              type="date"
              required
              value={quoteDate}
              disabled={fieldsDisabled}
              onChange={(e) => setQuoteDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="validUntil" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Valid until
            </label>
            <input
              id="validUntil"
              type="date"
              required
              value={validUntil}
              disabled={fieldsDisabled}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        </div>

        <fieldset className="min-w-0 border-0 p-0" disabled={fieldsDisabled}>
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Line items</legend>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Default rows match typical fleet tracking quotes — adjust quantities and prices before sending.
          </p>
          <div className="mt-3 flex flex-col gap-4">
            {lines.map((row, index) => (
              <div
                key={row.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Line {index + 1}
                  </span>
                  {lines.length > 1 && !fieldsDisabled ? (
                    <button
                      type="button"
                      onClick={() => removeLine(row.id)}
                      className="text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => updateLine(row.id, { description: e.target.value })}
                      placeholder="Description"
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min={0.0001}
                      step="any"
                      value={row.quantity}
                      onChange={(e) => updateLine(row.id, { quantity: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">Quantity</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.unitPrice}
                      onChange={(e) => updateLine(row.id, { unitPrice: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">Unit price</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!fieldsDisabled ? (
            <button
              type="button"
              onClick={addLine}
              className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-emerald-400 hover:text-emerald-800 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-600 dark:hover:text-emerald-300"
            >
              + Add line item
            </button>
          ) : null}
        </fieldset>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Notes <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea
            id="notes"
            rows={3}
            maxLength={2000}
            value={notes}
            disabled={fieldsDisabled}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment terms, deposit, travel assumptions…"
            className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        {error || saveState.error ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {error ?? saveState.error}
          </p>
        ) : null}

        {saveState.ok ? (
          <p className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
            Quote saved.
          </p>
        ) : null}

        {markSentState.error ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {markSentState.error}
          </p>
        ) : null}

        {markSentState.ok && markSentState.message ? (
          <p
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
            role="status"
          >
            {markSentState.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {!fieldsDisabled ? (
            <form action={submitSaveDraft}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                {quoteId ? "Save changes" : "Save draft"}
              </button>
            </form>
          ) : null}
          {quoteId && !fieldsDisabled && !isConverted ? (
            <form action={submitMarkSent}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-400 bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-200 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                Mark as sent
              </button>
            </form>
          ) : null}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            {downloading ? "Generating…" : "Download PDF"}
          </button>
          {!isConverted ? (
            <button
              type="button"
              onClick={openEmailPreview}
              className="rounded-lg border border-emerald-600 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 dark:border-emerald-500 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
            >
              Email quote…
            </button>
          ) : null}
          <Link
            href="/admin/quotes"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            All quotes
          </Link>
        </div>
      </div>

      <QuoteEmailPreviewDialog
        open={emailOpen}
        quoteId={quoteId || undefined}
        quoteNumber={displayNumber}
        attachmentName={attachmentName}
        to={emailTo}
        cc={emailCc}
        bcc={emailBcc}
        subject={emailSubject}
        bodyText={emailBody}
        quotePayloadJson={quotePayloadJson}
        sendState={sendState}
        sendAction={sendAction}
        onToChange={setEmailTo}
        onCcChange={setEmailCc}
        onBccChange={setEmailBcc}
        onSubjectChange={setEmailSubject}
        onBodyTextChange={setEmailBody}
        onBack={() => setEmailOpen(false)}
      />
    </>
  );
}
