"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createBroadcastTemplate,
  deleteBroadcastTemplate,
  sendBroadcastTemplateTestEmail,
  updateBroadcastTemplate,
  type BroadcastTemplateFormState,
  type BroadcastTemplateTestState,
} from "@/app/admin/broadcasts/actions";
import {
  applyBroadcastMergeFields,
  BROADCAST_MERGE_FIELDS,
  BROADCAST_MERGE_SAMPLE,
  broadcastBodyToEmailParts,
} from "@/lib/broadcast/merge-fields";
import { BROADCAST_CATEGORY_OPTIONS } from "@/lib/broadcast/template-labels";

const initialSaveState: BroadcastTemplateFormState = { error: null };
const initialTestState: BroadcastTemplateTestState = { error: null };

function fieldClass() {
  return "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
}

function SaveButton({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? "Saving…" : isNew ? "Create template" : "Save changes"}
    </button>
  );
}

function TestSendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-800 dark:bg-zinc-900 dark:text-sky-100 dark:hover:bg-sky-950/40"
    >
      {pending ? "Sending…" : "Send test email"}
    </button>
  );
}

export type BroadcastTemplateFormInitial = {
  id?: string;
  name: string;
  category: string;
  subject: string;
  bodyText: string;
  isActive: boolean;
  isSystem: boolean;
  defaultTestTo: string;
};

export function BroadcastTemplateForm({ initial, isNew }: { initial: BroadcastTemplateFormInitial; isNew: boolean }) {
  const saveAction = isNew ? createBroadcastTemplate : updateBroadcastTemplate;
  const [saveState, saveFormAction] = useActionState(saveAction, initialSaveState);
  const [testState, testFormAction] = useActionState(sendBroadcastTemplateTestEmail, initialTestState);

  const [subject, setSubject] = useState(initial.subject);
  const [bodyText, setBodyText] = useState(initial.bodyText);

  const preview = useMemo(() => {
    return broadcastBodyToEmailParts(subject, bodyText, BROADCAST_MERGE_SAMPLE);
  }, [subject, bodyText]);

  function insertToken(token: string, field: "subject" | "bodyText") {
    if (field === "subject") {
      setSubject((s) => s + token);
    } else {
      setBodyText((b) => (b ? `${b}\n${token}` : token));
    }
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <form action={saveFormAction} className="min-w-0 flex-1 space-y-5">
        {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

        {saveState.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            {saveState.error}
          </p>
        ) : saveState.ok ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            Saved.
          </p>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bt-name">
            Template name
          </label>
          <input
            id="bt-name"
            name="name"
            required
            maxLength={120}
            defaultValue={initial.name}
            className={fieldClass()}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bt-category">
            Category
          </label>
          <select
            id="bt-category"
            name="category"
            defaultValue={initial.category}
            className={fieldClass()}
          >
            {BROADCAST_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bt-subject">
            Email subject
          </label>
          <input
            id="bt-subject"
            name="subject"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={fieldClass()}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bt-body">
            Message body (plain text)
          </label>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Use blank lines between paragraphs. Variables like {"{{first_name}}"} are filled per customer when you send
            a broadcast.
          </p>
          <textarea
            id="bt-body"
            name="bodyText"
            required
            rows={14}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            className={`${fieldClass()} font-mono text-[13px]`}
          />
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Insert variable</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BROADCAST_MERGE_FIELDS.map((f) => (
              <span key={f.key} className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => insertToken(f.token, "subject")}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  + subject: {f.label}
                </button>
                <button
                  type="button"
                  onClick={() => insertToken(f.token, "bodyText")}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
                >
                  + body: {f.label}
                </button>
              </span>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initial.isActive}
            value="true"
            className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
          />
          Active (available when sending broadcasts)
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <SaveButton isNew={isNew} />
          {initial.isSystem ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">System template — can be edited but not deleted.</p>
          ) : initial.id ? (
            <button
              type="submit"
              formAction={deleteBroadcastTemplate}
              className="text-sm text-red-700 hover:underline dark:text-red-400"
              formNoValidate
            >
              Delete template
            </button>
          ) : null}
        </div>
      </form>

      <div className="flex w-full flex-col gap-6 lg:max-w-md lg:shrink-0">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Preview (sample data)</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Shows how merge fields resolve for a fictional customer.
          </p>
          <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Subject</p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">{preview.subject}</p>
          <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Body</p>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {applyBroadcastMergeFields(bodyText, BROADCAST_MERGE_SAMPLE)}
            {"\n\n— Track Lucia\nOperational notice…"}
          </pre>
        </div>

        <div className="rounded-xl border border-sky-200/90 bg-gradient-to-br from-white via-white to-sky-50/50 p-4 shadow-sm dark:border-sky-900/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-sky-950/20">
          <h2 className="text-sm font-semibold text-sky-950 dark:text-sky-100">Test email</h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Sends one message using sample merge data. Uses SMTP from Admin → Settings. Subject is prefixed with [Test].
          </p>
          <form action={testFormAction} className="mt-4 flex flex-col gap-3">
            {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
            <input type="hidden" name="subject" value={subject} readOnly />
            <input type="hidden" name="bodyText" value={bodyText} readOnly />
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bt-test-to">
                Send to
              </label>
              <input
                id="bt-test-to"
                name="testTo"
                type="email"
                defaultValue={initial.defaultTestTo}
                className={fieldClass()}
              />
            </div>
            {testState.error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                {testState.error}
              </p>
            ) : null}
            {testState.message ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
                {testState.message}
              </p>
            ) : null}
            <TestSendButton />
          </form>
        </div>
      </div>
    </div>
  );
}
