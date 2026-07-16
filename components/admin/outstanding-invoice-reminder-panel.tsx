"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  sendOutstandingInvoiceReminderAction,
  type OutstandingInvoiceReminderState,
} from "@/app/admin/customers/billing-actions";
import {
  buildOutstandingInvoiceReminderEmailSubject,
  buildOutstandingInvoiceReminderEmailText,
  buildOutstandingInvoiceReminderWhatsAppText,
  type OutstandingInvoiceReminderCandidate,
} from "@/lib/billing/outstanding-invoice-reminder";

const initialState: OutstandingInvoiceReminderState = { error: null };

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600"
    >
      {pending ? "Sending…" : "Send reminder"}
    </button>
  );
}

export function OutstandingInvoiceReminderPanel({
  customerId,
  customerName,
  greetingName,
  customerEmail,
  customerPhone,
  whatsAppConfigured,
  candidates,
}: {
  customerId: string;
  customerName: string;
  greetingName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  whatsAppConfigured: boolean;
  candidates: OutstandingInvoiceReminderCandidate[];
}) {
  const router = useRouter();
  const [state, action] = useActionState(sendOutstandingInvoiceReminderAction, initialState);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => candidates.map((item) => item.selectionKey));
  const [sendEmail, setSendEmail] = useState(Boolean(customerEmail?.trim()));
  const [sendWhatsApp, setSendWhatsApp] = useState(Boolean(customerPhone?.trim()) && whatsAppConfigured);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  const selectedItems = useMemo(
    () => candidates.filter((item) => selectedKeys.includes(item.selectionKey)),
    [candidates, selectedKeys],
  );

  const emailPreview = useMemo(() => {
    if (selectedItems.length === 0) return null;
    return {
      subject: buildOutstandingInvoiceReminderEmailSubject(selectedItems.length),
      body: buildOutstandingInvoiceReminderEmailText({ greetingName, items: selectedItems }),
    };
  }, [greetingName, selectedItems]);

  const whatsAppPreview = useMemo(() => {
    if (selectedItems.length === 0) return null;
    return buildOutstandingInvoiceReminderWhatsAppText({ greetingName, items: selectedItems });
  }, [greetingName, selectedItems]);

  function toggleSelection(key: string) {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Outstanding invoice reminder</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Send one reminder covering multiple unpaid invoices with payment links for {customerName}.
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          No outstanding invoices with payment links are available for this customer right now.
        </p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="customerId" value={customerId} />
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
            <div className="border-b border-zinc-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Select invoices to include
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {candidates.map((item) => {
                const checked = selectedKeys.includes(item.selectionKey);
                return (
                  <label
                    key={item.selectionKey}
                    className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200"
                  >
                    <input
                      type="checkbox"
                      name="selection"
                      value={item.selectionKey}
                      checked={checked}
                      onChange={() => toggleSelection(item.selectionKey)}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {item.label}
                        {item.reference ? ` (${item.reference})` : ""}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        {item.amountLabel}
                        {item.dueDateLabel ? ` · Due ${item.dueDateLabel}` : ""}
                        {` · ${item.source === "native_invoice" ? "TL invoice" : "Stripe invoice"}`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="sendEmail"
                checked={sendEmail}
                disabled={!customerEmail?.trim()}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Email {customerEmail ? `(${customerEmail})` : "— no email on file"}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                name="sendWhatsApp"
                checked={sendWhatsApp}
                disabled={!customerPhone?.trim() || !whatsAppConfigured}
                onChange={(e) => setSendWhatsApp(e.target.checked)}
              />
              WhatsApp {customerPhone ? `(${customerPhone})` : "— no phone on file"}
            </label>
          </div>

          {!whatsAppConfigured && customerPhone ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Twilio WhatsApp is not configured, so only email can be sent.
            </p>
          ) : null}

          {!customerEmail?.trim() && !customerPhone?.trim() ? (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Add an email and/or phone number on the customer profile before sending reminders.
            </p>
          ) : null}

          {selectedItems.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/50">
                <div className="border-b border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
                  Email preview
                </div>
                <div className="space-y-2 px-3 py-3 text-xs text-zinc-700 dark:text-zinc-300">
                  <p>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Subject:</span>{" "}
                    {emailPreview?.subject}
                  </p>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans leading-relaxed">
                    {emailPreview?.body}
                  </pre>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/50">
                <div className="border-b border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
                  WhatsApp preview
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 py-3 font-sans text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {whatsAppPreview}
                </pre>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Choose at least one invoice to generate the reminder.</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <SendButton disabled={selectedItems.length === 0 || (!sendEmail && !sendWhatsApp)} />
            {state.error ? (
              <span className="text-sm text-rose-700 dark:text-rose-400" role="alert">
                {state.error}
              </span>
            ) : null}
            {state.ok && state.message ? (
              <span className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
                {state.message}
              </span>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}
