"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  markInvoiceSentAction,
  saveInvoiceAction,
  sendInvoiceEmailAction,
  type MarkInvoiceSentState,
  type SaveInvoiceState,
  type SendInvoiceEmailState,
} from "@/app/admin/tl-invoices/actions";
import { InvoiceEmailPreviewDialog } from "@/components/admin/invoice-email-preview-dialog";
import { CopyValueButton } from "@/components/admin/copy-value-button";
import {
  defaultInvoiceEmailBody,
  defaultInvoiceEmailSubject,
  INVOICE_NUMBER_EMAIL_PLACEHOLDER,
} from "@/lib/billing/invoice-email-body";
import { DEFAULT_QUOTE_EMAIL_BCC } from "@/lib/billing/quote-email-recipients";
import type { InvoiceRequestPayload } from "@/lib/billing/invoice-payload";
import { formatMoney, computeDocumentTotals } from "@/lib/domain/native-billing";

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
  discountAmount: number;
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

function SaveDraftButton({ hasInvoiceId }: { hasInvoiceId: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
    >
      {pending ? "Saving…" : hasInvoiceId ? "Save changes" : "Save draft"}
    </button>
  );
}

function InvoiceLivePreview({
  customer,
  clientName,
  invoiceNumber,
  issueDate,
  dueDate,
  currency,
  lines,
  totals,
  notes,
  paymentInstructions,
}: {
  customer: InvoiceCustomerOption | null;
  clientName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  lines: LineRow[];
  totals: { subtotal: number; discountTotal: number; total: number };
  notes: string;
  paymentInstructions: string;
}) {
  const billTo = customer?.billToLines ?? (clientName.trim() ? [clientName.trim()] : []);
  const visibleLines = lines.filter((line) => line.description.trim());
  const formatDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

  return (
    <aside className="min-w-0 lg:sticky lg:top-5 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Live preview</p><p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">Customer-facing invoice</p></div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">TL</div>
        </div>
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Invoice</h2><p className="mt-1 text-xs text-zinc-500">{invoiceNumber}</p></div><div className="text-right text-xs text-zinc-500"><p>Issued</p><p className="mt-1 font-medium text-zinc-800 dark:text-zinc-200">{formatDate(issueDate)}</p></div></div>
          <div className="mt-7 grid gap-5 border-b border-zinc-200 pb-5 text-sm dark:border-zinc-700 sm:grid-cols-2"><div><p className="text-xs font-medium text-zinc-500">Billed to</p><p className="mt-2 font-semibold text-zinc-900 dark:text-white">{billTo[0] || "Select a customer"}</p>{billTo.slice(1).map((line, index) => <p key={`${line}-${index}`} className="text-xs text-zinc-500">{line}</p>)}{customer?.email ? <p className="mt-1 text-xs text-zinc-500">{customer.email}</p> : null}</div><div className="sm:text-right"><p className="text-xs font-medium text-zinc-500">Due date</p><p className="mt-2 font-semibold text-zinc-900 dark:text-white">{formatDate(dueDate)}</p></div></div>
          <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950"><span>Item / service</span><span>Qty</span><span>Total</span></div>{visibleLines.length ? visibleLines.map((line, index) => { const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0); return <div key={`${line.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-zinc-100 px-3 py-3 text-sm dark:border-zinc-800"><span className="min-w-0 break-words text-zinc-800 dark:text-zinc-200">{line.description}</span><span className="text-zinc-500">{line.quantity || "0"}</span><span className="font-medium tabular-nums">{formatMoney(amount, currency)}</span></div>; }) : <p className="px-3 py-8 text-center text-sm text-zinc-500">Add line items to see them here.</p>}<div className="flex items-center justify-between border-t border-zinc-200 px-3 py-3 text-sm font-semibold dark:border-zinc-700"><span>Grand total</span><span className="tabular-nums">{formatMoney(totals.total, currency)}</span></div></div>
          <div className="mt-7 space-y-4 text-xs text-zinc-500"><div><p className="font-semibold text-zinc-700 dark:text-zinc-300">Payment instructions</p><p className="mt-1 whitespace-pre-wrap">{paymentInstructions || "Add payment instructions in the editor."}</p></div>{notes ? <div><p className="font-semibold text-zinc-700 dark:text-zinc-300">Notes</p><p className="mt-1 whitespace-pre-wrap">{notes}</p></div> : null}</div>
        </div>
      </div>
    </aside>
  );
}

export function InvoiceGeneratorForm({
  customers,
  initial,
  initialCustomerId,
  readOnly = false,
  publicPayUrl = null,
  stripeConfigured = false,
}: {
  customers: InvoiceCustomerOption[];
  initial?: InvoiceFormInitial;
  initialCustomerId?: string | null;
  readOnly?: boolean;
  publicPayUrl?: string | null;
  stripeConfigured?: boolean;
}) {
  const router = useRouter();
  const lineIdRef = useRef(0);
  const [invoiceId, setInvoiceId] = useState(initial?.invoiceId ?? "");
  const assignedNumber = initial?.number ?? null;

  const [customerId, setCustomerId] = useState(initial?.customerId ?? initialCustomerId ?? "");
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayYmd());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? addDaysYmd(todayYmd(), 30));
  const [currency, setCurrency] = useState(initial?.currency ?? "XCD");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [paymentInstructions, setPaymentInstructions] = useState(
    initial?.paymentInstructions || DEFAULT_PAYMENT_INSTRUCTIONS,
  );
  const [allowOnlinePayment, setAllowOnlinePayment] = useState(initial?.allowOnlinePayment ?? false);
  const [discountAmount, setDiscountAmount] = useState(
    initial?.discountAmount != null && initial.discountAmount > 0 ? String(initial.discountAmount) : "",
  );
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

  const previewTotals = useMemo(() => {
    const lineItems = lines
      .map((row) => ({
        description: row.description.trim(),
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
      }))
      .filter((row) => row.description.length > 0);
    const discountRaw = discountAmount.trim() === "" ? 0 : Number(discountAmount);
    const discount = Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : 0;
    return computeDocumentTotals(lineItems, null, discount);
  }, [lines, discountAmount]);

  const displayNumber = assignedNumber ?? INVOICE_NUMBER_EMAIL_PLACEHOLDER;
  const isVoid = initial?.status === "void" || initial?.status === "written_off";
  const fieldsDisabled = readOnly || isVoid;

  useEffect(() => {
    if (initial?.invoiceId) {
      setInvoiceId(initial.invoiceId);
    }
  }, [initial?.invoiceId]);

  useEffect(() => {
    if (saveState.ok && saveState.invoiceId) {
      setInvoiceId(saveState.invoiceId);
    }
  }, [saveState.ok, saveState.invoiceId]);

  useEffect(() => {
    if (saveState.ok && saveState.next) {
      if (saveState.next !== window.location.pathname) {
        router.push(saveState.next);
      } else {
        router.refresh();
      }
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

    const discountRaw = discountAmount.trim() === "" ? 0 : Number(discountAmount);
    if (!Number.isFinite(discountRaw) || discountRaw < 0) return { error: "Invalid discount amount." };

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
        discountAmount: discountRaw > 0 ? discountRaw : 0,
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
    const draft = defaultInvoiceEmailBody({
      greetingName,
      invoiceNumber: assignedNumber ?? INVOICE_NUMBER_EMAIL_PLACEHOLDER,
      dueDate: payload.dueDate ? new Date(`${payload.dueDate}T12:00:00.000Z`) : null,
      amountDue: initial?.amountDue ?? previewTotals.total,
      currency: payload.currency,
      payUrl: publicPayUrl,
      allowOnlinePayment: allowOnlinePayment && stripeConfigured,
    });
    setPayloadJson(JSON.stringify(payload));
    setEmailTo(selectedCustomer?.email?.trim() ?? "");
    setEmailCc("");
    setEmailBcc(DEFAULT_QUOTE_EMAIL_BCC);
    setEmailSubject(
      defaultInvoiceEmailSubject(assignedNumber ?? INVOICE_NUMBER_EMAIL_PLACEHOLDER),
    );
    setEmailBody(draft.text);
    setEmailOpen(true);
  }

  function submitSave(formData: FormData) {
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setError(null);
    formData.set("invoicePayloadJson", JSON.stringify(built.payload));
    if (invoiceId) {
      formData.set("invoiceId", invoiceId);
    }
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
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40 sm:p-5">
        <div className="mb-5 flex flex-col gap-3 border-b border-zinc-200 px-1 pb-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3"><Link href="/admin/tl-invoices" className="text-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Close invoice editor">×</Link><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{assignedNumber || "New invoice"}</p><p className="text-xs text-zinc-500">Draft invoice workspace</p></div></div>
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{initial?.status ?? "Draft"}</span>{!fieldsDisabled ? <form action={submitSave}><input type="hidden" name="invoiceId" value={invoiceId} /> <SaveDraftButton hasInvoiceId={Boolean(invoiceId)} /></form> : null}{invoiceId && !fieldsDisabled ? <form action={submitMarkSent}><input type="hidden" name="invoiceId" value={invoiceId} /><button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">Send now</button></form> : null}</div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.86fr)]">
        <div className="flex min-w-0 flex-col gap-5 rounded-xl bg-white p-3 dark:bg-zinc-900 sm:p-5">
        {publicPayUrl ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">Customer pay link</p>
                <a
                  href={publicPayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block break-all text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {publicPayUrl}
                </a>
              </div>
              <CopyValueButton value={publicPayUrl} kind="pay link" className="mt-0.5 shrink-0" />
            </div>
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
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
            <div className="grid min-w-[540px] grid-cols-[22px_minmax(180px,1fr)_72px_110px_92px_28px] gap-2 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950"><span /><span>Description</span><span>Qty</span><span>Rate</span><span className="text-right">Amount</span><span /></div>
            {lines.map((row, i) => (
              <div key={row.id} className="grid min-w-[540px] grid-cols-[22px_minmax(180px,1fr)_72px_110px_92px_28px] items-center gap-2 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <span className="text-zinc-400" aria-hidden="true">⋮⋮</span>
                <label className="sr-only" htmlFor={`description-${row.id}`}>Description line {i + 1}</label>
                <input
                  id={`description-${row.id}`}
                  type="text"
                  value={row.description}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, description: e.target.value } : r)),
                    )
                  }
                  placeholder="Description"
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                />
                <label className="sr-only" htmlFor={`quantity-${row.id}`}>Quantity line {i + 1}</label><input
                    id={`quantity-${row.id}`}
                    type="number"
                    min={0.0001}
                    step="any"
                    value={row.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r)),
                      )
                    }
                    className="w-full rounded-lg border px-2.5 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  /><label className="sr-only" htmlFor={`unit-price-${row.id}`}>Unit price line {i + 1}</label><input
                    id={`unit-price-${row.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.unitPrice}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, unitPrice: e.target.value } : r)),
                      )
                    }
                    className="w-full rounded-lg border px-2.5 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  /><span className="text-right text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-200">{formatMoney((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), currency)}</span><button type="button" onClick={() => setLines((p) => p.length <= 1 ? p : p.filter((r) => r.id !== row.id))} className="text-zinc-400 hover:text-rose-600" aria-label={`Remove line ${i + 1}`}>×</button>
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

        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Discount <span className="font-normal text-zinc-500">(optional, flat amount)</span>
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={discountAmount}
            disabled={fieldsDisabled}
            onChange={(e) => setDiscountAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1.5 w-full max-w-xs rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950"
          />
          {previewTotals.subtotal > 0 ? (
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600 dark:text-zinc-400">Subtotal</dt>
                <dd className="font-medium tabular-nums">{formatMoney(previewTotals.subtotal, currency)}</dd>
              </div>
              {previewTotals.discountTotal > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-600 dark:text-zinc-400">Discount</dt>
                  <dd className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                    −{formatMoney(previewTotals.discountTotal, currency)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                <dt className="font-medium">Total</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(previewTotals.total, currency)}</dd>
              </div>
            </dl>
          ) : null}
        </div>

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
              {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
              <SaveDraftButton hasInvoiceId={Boolean(invoiceId)} />
            </form>
          ) : null}
          {invoiceId && !fieldsDisabled ? (
            <form action={submitMarkSent}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
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
        <InvoiceLivePreview customer={selectedCustomer} clientName={clientName} invoiceNumber={displayNumber} issueDate={issueDate} dueDate={dueDate} currency={currency} lines={lines} totals={previewTotals} notes={notes} paymentInstructions={paymentInstructions} />
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
