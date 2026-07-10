"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  sendCustomerWhatsAppReplyAction,
  type WhatsAppReplyState,
} from "@/app/admin/customers/[id]/messages/actions";

const initial: WhatsAppReplyState = { error: null };

export type WhatsAppThreadMessage = {
  id: string;
  direction: string;
  body: string | null;
  kind: string;
  occurredAt: string;
};

function ReplyButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-emerald-600"
    >
      {pending ? "Sending…" : "Send reply"}
    </button>
  );
}

export function CustomerWhatsAppThread({
  customerId,
  phoneE164,
  sessionOpen,
  lastInboundAt,
  messages,
}: {
  customerId: string;
  phoneE164: string;
  sessionOpen: boolean;
  lastInboundAt: string | null;
  messages: WhatsAppThreadMessage[];
}) {
  const router = useRouter();
  const [state, action] = useActionState(sendCustomerWhatsAppReplyAction, initial);
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>
          Thread with <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">{phoneE164}</span>
        </span>
        {sessionOpen ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
            24h window open
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            Window closed — templates only
          </span>
        )}
        {lastInboundAt ? (
          <span className="text-xs text-zinc-500">
            Last inbound {new Date(lastInboundAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const inbound = m.direction === "inbound";
            return (
              <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    inbound
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                      : "bg-emerald-700 text-white dark:bg-emerald-600"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body || (m.kind === "template" ? "(template message)" : "—")}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      inbound ? "text-zinc-400" : "text-emerald-100/80"
                    }`}
                  >
                    {new Date(m.occurredAt).toLocaleString()}
                    {!inbound && m.kind === "template" ? " · template" : null}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {sessionOpen ? (
        <form ref={formRef} action={action} className="flex flex-col gap-2">
          <input type="hidden" name="customerId" value={customerId} />
          <textarea
            name="body"
            rows={3}
            placeholder="Type a free-form reply…"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <div className="flex flex-wrap items-center gap-3">
            <ReplyButton disabled={false} />
            {state.error ? (
              <span className="text-sm text-rose-700 dark:text-rose-400" role="alert">
                {state.error}
              </span>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Free-form replies require a customer message within the last 24 hours. Use{" "}
          <a href="/admin/message-templates" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Message templates
          </a>{" "}
          to send an approved WhatsApp template.
        </p>
      )}
    </div>
  );
}
