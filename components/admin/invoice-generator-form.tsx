"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  markInvoiceSentAction,
  saveInvoiceAction,
  sendInvoiceEmailAction,
  type MarkInvoiceSentState,
  type SaveInvoiceState,
  type SendInvoiceEmailState,
} from "@/app/admin/tl-invoices/actions";
import { InvoiceEmailPreviewDialog } from "@/components/admin/invoice-email-preview-dialog";
import {
  defaultInvoiceEmailBody,
  defaultInvoiceEmailSubject,
} from "@/lib/billing/invoice-email-body";
import { DEFAULT_QUOTE_EMAIL_BCC } from "@/lib/billing/quote-email-recipients";
import type { InvoiceRequestPayload } from "@/lib/billing/invoice-payload";
import { formatMoney } from "@/lib/domain/native-billing";

export type InvoiceCustomerOption = {
  id: string;
  label: string;
  email: string | null;
  billToLines: string[];
};

export type InvoiceFormInitial = {
  invoiceId: string;
  status: string;
  number: string | null;
  publicToken: string | null;
  customerId: string | null;
  clientName: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  notes: string;
  paymentInstructions: string;
  allowOnlinePayment: boolean;
  amountDue: number;
  lines: { description: string; quantity: string; unitPrice: string }[];
};

const DEFAULT_PAYMENT_INSTRUCTIONS =
  "Cash or cheque accepted. Cheques payable to Ellodane Enterprises. Contact us for bank transfer details.";

type LineRow = { id: number; description: string; quantity: string; unitPrice: string };

function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function addDaysYmd(base: string, days: number): string {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const initialSend: SendInvoiceEmailState = {};
const initialSave: SaveInvoiceState = {};
const initialMarkSent: MarkInvoiceSentState = {};

export function InvoiceGeneratorForm({
  customers,
  initial,
  readOnly = false,
  publicPayUrl = null,
  stripeConfigured = false,
}: {
  customers: InvoiceCustomerOption[];
  initial?: InvoiceFormInitial;
  readOnly?: boolean;
  publicPayUrl?: string | null;
  stripeConfigured?: boolean;
}) {
  const router = useRouter();
  const lineIdRef = useRef(0);
  const invoiceId = initial?.invoiceId ?? "";
  const assignedNumber = initial?.number ?? null;

  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayYmd());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? addDaysYmd(todayYmd(), 30));
  const [currency, setCurrency] = useState(initial?.currency ?? "XCD");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [paymentInstructions, setPaymentInstructions] = useState(
    initial?.paymentInstructions || DEFAULT_PAYMENT_INSTRUCTIONS,
  );
  const [allowOnlinePayment, setAllowOnlinePayment] = useState(initial?.allowOnlinePayment ?? false);
  const [lines, setLines] = useState<LineRow[]>(() =>
    (initial?.lines?.length ? initial.lines : [{ description: "", quantity: "1", unitPrice: "0" }]).map((row) => ({
      ...row,
      id: lineIdRef.current++,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [payloadJson, setPayloadJson] = useState("");

  const [sendState, sendAction] = useActionState(sendInvoiceEmailAction, initialSend);
  const [saveState, saveAction] = useActionState(saveInvoiceAction, initialSave);
  const [markSentState, markSentAction] = useActionState(markInvoiceSentAction, initialMarkSent);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const displayNumber = assignedNumber ?? "Draft";
  const isVoid = initial?.status === "void" || initial?.status === "written_off";
  const fieldsDisabled = readOnly || isVoid;

  useEffect(() => {
    if (saveState.ok && saveState.next) {
      router.push(saveState.next);
      router.refresh();
    }
  }, [saveState, router]);

  useEffect(() => {
    if (sendState.ok) router.refresh();
  }, [sendState.ok, router]);

  useEffect(() => {
    if (markSentState.ok) router.refresh();
  }, [markSentState.ok, router]);

  function buildPayload(): { payload: InvoiceRequestPayload; greetingName: string } | { error: string } {
    const lineItems = lines
      .map((row) => ({
        description: row.description.trim(),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
      }))
      .filter((row) => row.description.length > 0);

    if (!lineItems.length) return { error: "Add at least one line item." };
    for (const row of lineItems) {
      if (!Number.isFinite(row.quantity) || row.quantity <= 0) return { error: "Invalid quantity." };
      if (!Number.isFinite(row.unitPrice) || row.unitPrice < 0) return { error: "Invalid unit price." };
    }

    const billToLines =
      selectedCustomer?.billToLines ?? (clientName.trim() ? [clientName.trim()] : null);
    if (!billToLines?.length) return { error: "Choose a customer or enter a client name." };

    const greetingName =
      selectedCustomer?.label?.trim() || clientName.trim() || billToLines[0] || "there";

    return {
      payload: {
        customerId: customerId || null,
        billToLines,
        issueDate,
        dueDate: dueDate || null,
        currency,
        notes: notes.trim() || null,
        paymentInstructions: paymentInstructions.trim() || null,
        allowOnlinePayment: allowOnlinePayment && stripeConfigured,
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
    if (!invoiceId) {
      setError("Save the draft first to download a numbered PDF.");
      return;
    }

    setDownloading(true);
    try {
      const res = await fetch(`/api/admin/tl-invoices/${invoiceId}/pdf`, { method: "GET" });
      if (!res.ok) {
        setError("Could not generate PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${displayNumber.replace(/[^\w.-]+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error.");
    } finally {
      setDownloading(false);
    }
  }

  function openEmailPreview() {
    if (!invoiceId) {
      setError("Save the draft first — marking sent assigns a TL-INV number.");
      return;
    }
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    const { payload, greetingName } = built;
    const total = payload.lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const draft = defaultInvoiceEmailBody({
      greetingName,
      invoiceNumber: assignedNumber ?? "Draft",
      dueDate: payload.dueDate ? new Date(`${payload.dueDate}T12:00:00.000Z`) : null,
      amountDue: initial?.amountDue ?? total,
      currency: payload.currency,
      payUrl: publicPayUrl,
      allowOnlinePayment: allowOnlinePayment && stripeConfigured,
    });
    setPayloadJson(JSON.stringify(payload));
    setEmailTo(selectedCustomer?.email?.trim() ?? "");
    setEmailCc("");
    setEmailBcc(DEFAULT_QUOTE_EMAIL_BCC);
    setEmailSubject(defaultInvoiceEmailSubject(assignedNumber ?? "Draft"));
    setEmailBody(draft.text);
    setEmailOpen(true);
  }

  function submitSave(formData: FormData) {
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    formData.set("invoicePayloadJson", JSON.stringify(built.payload));
    if (invoiceId) formData.set("invoiceId", invoiceId);
    saveAction(formData);
  }

  function submitMarkSent(formData: FormData) {
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    if (!invoiceId) {
      setError("Save the draft first, then mark as sent.");
      return;
    }
    setError(null);
    formData.set("invoicePayloadJson", JSON.stringify(built.payload));
    formData.set("invoiceId", invoiceId);
    markSentAction(formData);
  }

  return (
    <>
      <div className="flex max-w-3xl flex-col gap-5">
        {publicPayUrl ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">Customer pay link</p>
            <a
              href={publicPayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 break-all text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {publicPayUrl}
            </a>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Customer</label>
            <select
              value={customerId}
              disabled={fieldsDisabled}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setClientName("");
              }}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
            >
              <option value="">Select or enter name below…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {!customerId ? (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Client name</label>
              <input
                type="text"
                value={clientName}
                disabled={fieldsDisabled}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </div>
          ) : null}
          <div>
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Invoice #</span>
            <p className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900">
              {assignedNumber ?? (
                <span className="text-zinc-500 dark:text-zinc-400">
                  Assigned when you mark sent or email (TL-INV-…)
                </span>
              )}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Currency</label>
            <input
              type="text"
              value={currency}
              disabled={fieldsDisabled}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Invoice date</label>
            <input
              type="date"
              value={issueDate}
              disabled={fieldsDisabled}
              onChange={(e) => setIssueDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Due date</label>
            <input
              type="date"
              value={dueDate}
              disabled={fieldsDisabled}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
        </div>

        <fieldset disabled={fieldsDisabled} className="border-0 p-0">
          <legend className="text-sm font-medium">Line items</legend>
          <div className="mt-3 flex flex-col gap-3">
            {lines.map((row, i) => (
              <div key={row.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <span className="text-xs font-semibold uppercase text-zinc-500">Line {i + 1}</span>
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, description: e.target.value } : r)),
                    )
                  }
                  placeholder="Description"
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0.0001}
                    step="any"
                    value={row.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r)),
                      )
                    }
                    className="rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.unitPrice}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, unitPrice: e.target.value } : r)),
                      )
                    }
                    className="rounded-lg border px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  />
                </div>
              </div>
            ))}
          </div>
          {!fieldsDisabled ? (
            <button
              type="button"
              onClick={() =>
                setLines((p) => [...p, { id: lineIdRef.current++, description: "", quantity: "1", unitPrice: "0" }])
              }
              className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
            >
              + Add line
            </button>
          ) : null}
        </fieldset>

        <div>
          <label className="block text-sm font-medium">Payment instructions</label>
          <textarea
            rows={3}
            value={paymentInstructions}
            disabled={fieldsDisabled}
            onChange={(e) => setPaymentInstructions(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>

        {!fieldsDisabled ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={allowOnlinePayment}
                disabled={!stripeConfigured}
                onChange={(e) => setAllowOnlinePayment(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 disabled:opacity-50"
              />
              <span className="text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">Allow pay by card online</span>
                <span className="mt-1 block text-zinc-600 dark:text-zinc-400">
                  {stripeConfigured
                    ? "Adds a Pay with card button on the customer pay link. Cash, cheque, and bank instructions still apply."
                    : "Stripe is not configured — online card payment is unavailable."}
                </span>
              </span>
            </label>
          </div>
        ) : initial?.allowOnlinePayment ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Online card payment: <span className="font-medium text-zinc-800 dark:text-zinc-200">enabled</span>
          </p>
        ) : null}

        <div>
          <label className="block text-sm font-medium">Notes</label>
          <textarea
            rows={2}
            value={notes}
            disabled={fieldsDisabled}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          />
        </div>

        {initial && initial.amountDue > 0 && initial.status !== "draft" ? (
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Amount due: {formatMoney(initial.amountDue, currency)}
          </p>
        ) : null}

        {(error || saveState.error) && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error ?? saveState.error}
          </p>
        )}

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

        <div className="flex flex-wrap gap-3">
          {!fieldsDisabled ? (
            <form action={submitSave}>
              <button type="submit" className="rounded-lg border px-5 py-2.5 text-sm font-semibold">
                {invoiceId ? "Save changes" : "Save draft"}
              </button>
            </form>
          ) : null}
          {invoiceId && !fieldsDisabled ? (
            <form action={submitMarkSent}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-400 bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-200 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                Mark as sent
              </button>
            </form>
          ) : null}
          {invoiceId ? (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {downloading ? "Generating…" : "Download PDF"}
            </button>
          ) : null}
          {!isVoid && invoiceId ? (
            <button
              type="button"
              onClick={openEmailPreview}
              className="rounded-lg border border-emerald-600 px-5 py-2.5 text-sm font-semibold text-emerald-800"
            >
              Email invoice…
            </button>
          ) : null}
          <Link href="/admin/tl-invoices" className="text-sm font-medium text-zinc-600 hover:underline">
            All invoices
          </Link>
        </div>
      </div>

      <InvoiceEmailPreviewDialog
        open={emailOpen}
        invoiceId={invoiceId}
        invoiceNumber={displayNumber}
        to={emailTo}
        cc={emailCc}
        bcc={emailBcc}
        subject={emailSubject}
        bodyText={emailBody}
        invoicePayloadJson={payloadJson}
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
