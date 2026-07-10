"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  sendQuickEmailAction,
  sendQuickSmsAction,
  sendQuickWhatsAppAction,
  sendQuickWhatsAppFreeformAction,
  type QuickSendState,
} from "@/app/admin/message-templates/actions";
import { QuickCustomerPicker, type QuickSendCustomer } from "@/components/admin/quick-customer-picker";
import {
  getQuickWhatsAppTemplate,
  type QuickWhatsAppTemplateDef,
  type QuickWhatsAppTemplateKind,
} from "@/lib/communications/quick-send-whatsapp-templates";

const initial: QuickSendState = { error: null };

type Channel = "email" | "whatsapp" | "sms";

function SendButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

function StatusLine({ state }: { state: QuickSendState }) {
  if (state.error) {
    return (
      <span className="text-sm text-rose-700 dark:text-rose-400" role="alert">
        {state.error}
      </span>
    );
  }
  if (state.ok && state.message) {
    return (
      <span className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
        {state.message}
      </span>
    );
  }
  return null;
}

function EmailForm({
  customers,
  ready,
}: {
  customers: QuickSendCustomer[];
  ready: boolean;
}) {
  const [state, action] = useActionState(sendQuickEmailAction, initial);
  const [selected, setSelected] = useState<QuickSendCustomer | null>(null);
  const emailCustomers = useMemo(() => customers.filter((c) => c.email), [customers]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={selected?.id ?? ""} />
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">To (customer)</label>
        <QuickCustomerPicker
          customers={emailCustomers}
          selected={selected}
          onSelect={setSelected}
          searchHint="Search by name or email…"
          emptyHint="No customers with an email match."
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">Subject</label>
        <input
          type="text"
          name="subject"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">Message</label>
        <textarea
          name="body"
          rows={7}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>
      {!ready ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          SMTP is not configured — set mail settings under Admin → Settings before sending.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SendButton label="Send email" disabled={!ready || !selected?.email} />
        <StatusLine state={state} />
      </div>
    </form>
  );
}

function WhatsAppForm({
  customers,
  templates,
  ready,
  sessionOpenByCustomerId,
}: {
  customers: QuickSendCustomer[];
  templates: QuickWhatsAppTemplateDef[];
  ready: boolean;
  sessionOpenByCustomerId: Record<string, boolean>;
}) {
  const [templateState, templateAction] = useActionState(sendQuickWhatsAppAction, initial);
  const [freeformState, freeformAction] = useActionState(sendQuickWhatsAppFreeformAction, initial);
  const [selected, setSelected] = useState<QuickSendCustomer | null>(null);
  const [kind, setKind] = useState<QuickWhatsAppTemplateKind | "">(templates[0]?.kind ?? "");
  const [mode, setMode] = useState<"template" | "freeform">("template");
  const template = kind ? getQuickWhatsAppTemplate(kind) : null;
  const phoneCustomers = useMemo(() => customers.filter((c) => c.phone), [customers]);
  const sessionOpen = selected ? Boolean(sessionOpenByCustomerId[selected.id]) : false;

  const [vars, setVars] = useState<Record<string, string>>({});

  useEffect(() => {
    const def = getQuickWhatsAppTemplate(kind);
    if (!def) {
      setVars({});
      return;
    }
    const next: Record<string, string> = {};
    for (const field of def.fields) {
      next[field.key] = field.fromFirstName && selected?.firstName ? selected.firstName : "";
    }
    setVars(next);
  }, [kind, selected?.id, selected?.firstName]);

  useEffect(() => {
    if (!sessionOpen && mode === "freeform") setMode("template");
  }, [sessionOpen, mode]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">To (customer)</label>
        <QuickCustomerPicker
          customers={phoneCustomers}
          selected={selected}
          onSelect={setSelected}
          searchHint="Search by name or phone…"
          emptyHint="No customers with a phone match."
        />
        {selected ? (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {sessionOpen
              ? "24-hour window is open — free-form replies are allowed."
              : "24-hour window is closed — approved templates only."}
          </p>
        ) : null}
      </div>

      {sessionOpen ? (
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-950/50">
          <button
            type="button"
            onClick={() => setMode("template")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "template"
                ? "bg-white shadow-sm dark:bg-zinc-800"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Template
          </button>
          <button
            type="button"
            onClick={() => setMode("freeform")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "freeform"
                ? "bg-white shadow-sm dark:bg-zinc-800"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Free-form
          </button>
        </div>
      ) : null}

      {mode === "freeform" && sessionOpen ? (
        <form action={freeformAction} className="flex flex-col gap-4">
          <input type="hidden" name="customerId" value={selected?.id ?? ""} />
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">Message</label>
            <textarea
              name="body"
              rows={5}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-zinc-600 dark:bg-zinc-950"
            />
          </div>
          {!ready ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">Twilio WhatsApp is not configured.</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <SendButton label="Send WhatsApp" disabled={!ready || !selected?.phone} />
            <StatusLine state={freeformState} />
          </div>
        </form>
      ) : (
        <form action={templateAction} className="flex flex-col gap-4">
          <input type="hidden" name="customerId" value={selected?.id ?? ""} />
          <input type="hidden" name="templateKind" value={kind} />

          {templates.length === 0 ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              No WhatsApp Content SIDs are configured. Set the{" "}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">TWILIO_WA_TEMPLATE_*</code> env vars, then
              redeploy.
            </p>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">Template</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as QuickWhatsAppTemplateKind)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                >
                  {templates.map((t) => (
                    <option key={t.kind} value={t.kind}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {template ? (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{template.description}</p>
                ) : null}
              </div>

              {template
                ? template.fields.map((field) => (
                    <div key={field.key}>
                      <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {field.label} <code className="text-xs text-zinc-500">{`{{${field.key}}}`}</code>
                      </label>
                      <input
                        type="text"
                        name={`var_${field.key}`}
                        value={vars[field.key] ?? ""}
                        onChange={(e) => setVars((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                      />
                    </div>
                  ))
                : null}
            </>
          )}

          {!ready ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">Twilio WhatsApp is not configured.</p>
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Outside the 24-hour window, only Meta-approved templates can be sent.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <SendButton
              label="Send WhatsApp"
              disabled={!ready || !selected?.phone || !template || templates.length === 0}
            />
            <StatusLine state={templateState} />
          </div>
        </form>
      )}
    </div>
  );
}

function SmsForm({
  customers,
  ready,
}: {
  customers: QuickSendCustomer[];
  ready: boolean;
}) {
  const [state, action] = useActionState(sendQuickSmsAction, initial);
  const [selected, setSelected] = useState<QuickSendCustomer | null>(null);
  const phoneCustomers = useMemo(() => customers.filter((c) => c.phone), [customers]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={selected?.id ?? ""} />
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">To (customer)</label>
        <QuickCustomerPicker
          customers={phoneCustomers}
          selected={selected}
          onSelect={setSelected}
          searchHint="Search by name or phone…"
          emptyHint="No customers with a phone match."
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">Message</label>
        <textarea
          name="body"
          rows={5}
          maxLength={1600}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>
      {!ready ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Twilio SMS is not configured (need account SID, auth token, and SMS/WhatsApp from number).
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <SendButton label="Send SMS" disabled={!ready || !selected?.phone} />
        <StatusLine state={state} />
      </div>
    </form>
  );
}

export function QuickSendPanel({
  customers,
  whatsappTemplates,
  smtpReady,
  whatsappReady,
  smsReady,
  sessionOpenByCustomerId,
}: {
  customers: QuickSendCustomer[];
  whatsappTemplates: QuickWhatsAppTemplateDef[];
  smtpReady: boolean;
  whatsappReady: boolean;
  smsReady: boolean;
  sessionOpenByCustomerId: Record<string, boolean>;
}) {
  const [channel, setChannel] = useState<Channel>("email");

  const tabs: { id: Channel; label: string }[] = [
    { id: "email", label: "Email" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "sms", label: "SMS" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-950/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setChannel(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              channel === tab.id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {channel === "email" ? <EmailForm customers={customers} ready={smtpReady} /> : null}
      {channel === "whatsapp" ? (
        <WhatsAppForm
          customers={customers}
          templates={whatsappTemplates}
          ready={whatsappReady}
          sessionOpenByCustomerId={sessionOpenByCustomerId}
        />
      ) : null}
      {channel === "sms" ? <SmsForm customers={customers} ready={smsReady} /> : null}
    </div>
  );
}
