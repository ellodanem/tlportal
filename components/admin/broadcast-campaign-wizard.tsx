"use client";

import { useActionState, useCallback, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  createBroadcastCampaign,
  previewBroadcastAudienceAction,
  type BroadcastAudiencePreviewState,
  type CreateBroadcastCampaignState,
} from "@/app/admin/broadcasts/campaign-actions";
import {
  applyBroadcastMergeFields,
  BROADCAST_MERGE_FIELDS,
  BROADCAST_MERGE_SAMPLE,
  broadcastBodyToEmailParts,
} from "@/lib/broadcast/merge-fields";

export type BroadcastTemplateOption = {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
};

const initialPreview: BroadcastAudiencePreviewState = { error: null };
const initialCreate: CreateBroadcastCampaignState = { error: null };

function fieldClass() {
  return "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";
}

function SubmitCampaignButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? "Starting send…" : "Send broadcast"}
    </button>
  );
}

export function BroadcastCampaignWizard({ templates }: { templates: BroadcastTemplateOption[] }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [subject, setSubject] = useState(templates[0]?.subject ?? "");
  const [bodyText, setBodyText] = useState(templates[0]?.bodyText ?? "");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState(BROADCAST_MERGE_SAMPLE.incident_title);
  const [incidentStatus, setIncidentStatus] = useState(BROADCAST_MERGE_SAMPLE.incident_status);
  const [incidentEta, setIncidentEta] = useState(BROADCAST_MERGE_SAMPLE.eta);
  const [confirm, setConfirm] = useState("");

  const [previewState, previewAction, previewPending] = useActionState(previewBroadcastAudienceAction, initialPreview);
  const [createState, createAction] = useActionState(createBroadcastCampaign, initialCreate);
  const [, startPreviewTransition] = useTransition();

  const refreshPreview = useCallback(
    (inactive: boolean) => {
      const fd = new FormData();
      if (inactive) fd.set("includeInactive", "true");
      startPreviewTransition(() => {
        previewAction(fd);
      });
    },
    [previewAction],
  );

  const applyTemplate = useCallback(
    (id: string) => {
      const t = templates.find((x) => x.id === id);
      if (!t) return;
      setTemplateId(id);
      setSubject(t.subject);
      setBodyText(t.bodyText);
    },
    [templates],
  );

  const mergePreview = useMemo(
    () => ({
      ...BROADCAST_MERGE_SAMPLE,
      incident_title: incidentTitle,
      incident_status: incidentStatus,
      eta: incidentEta,
    }),
    [incidentTitle, incidentStatus, incidentEta],
  );

  const emailPreview = useMemo(
    () => broadcastBodyToEmailParts(subject, bodyText, mergePreview),
    [subject, bodyText, mergePreview],
  );

  function goToStep2() {
    refreshPreview(includeInactive);
    setStep(2);
  }

  function goToStep3() {
    refreshPreview(includeInactive);
    setStep(3);
  }

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Broadcast steps">
        {([1, 2, 3] as const).map((n) => (
          <span
            key={n}
            className={
              step === n
                ? "rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100"
                : "rounded-full bg-zinc-100 px-3 py-1 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }
          >
            {n}. {n === 1 ? "Message" : n === 2 ? "Audience" : "Review"}
          </span>
        ))}
      </nav>

      {createState.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {createState.error}
        </p>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bc-template">
                Template
              </label>
              <select
                id="bc-template"
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className={fieldClass()}
              >
                <option value="">Custom (manual)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bc-subject">
                Subject
              </label>
              <input
                id="bc-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                maxLength={200}
                className={fieldClass()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bc-body">
                Message body
              </label>
              <textarea
                id="bc-body"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                required
                rows={12}
                className={`${fieldClass()} font-mono text-[13px]`}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="bc-inc-title">
                  Incident title
                </label>
                <input
                  id="bc-inc-title"
                  value={incidentTitle}
                  onChange={(e) => setIncidentTitle(e.target.value)}
                  className={fieldClass()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="bc-inc-status">
                  Status
                </label>
                <input
                  id="bc-inc-status"
                  value={incidentStatus}
                  onChange={(e) => setIncidentStatus(e.target.value)}
                  className={fieldClass()}
                />
              </div>
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="bc-inc-eta">
                  ETA / window
                </label>
                <input
                  id="bc-inc-eta"
                  value={incidentEta}
                  onChange={(e) => setIncidentEta(e.target.value)}
                  className={fieldClass()}
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Variables: {BROADCAST_MERGE_FIELDS.map((f) => f.token).join(", ")}
            </p>
            <button
              type="button"
              onClick={goToStep2}
              disabled={!subject.trim() || !bodyText.trim()}
              className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
            >
              Next: audience
            </button>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Preview</h2>
            <p className="mt-2 text-xs font-medium text-zinc-500">Subject</p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{emailPreview.subject}</p>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
              {applyBroadcastMergeFields(bodyText, mergePreview)}
            </pre>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="max-w-lg flex flex-col gap-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setIncludeInactive(e.target.checked);
                refreshPreview(e.target.checked);
              }}
              className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600"
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">Include inactive customers</span>
              <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                Off: only customers with an active service assignment and a valid email. On: every customer with a valid
                email (duplicate addresses are sent once).
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm dark:border-sky-900/50 dark:bg-sky-950/30">
            {previewPending ? (
              <p className="text-zinc-600 dark:text-zinc-400">Calculating audience…</p>
            ) : previewState.error ? (
              <p className="text-red-800 dark:text-red-200">{previewState.error}</p>
            ) : (
              <ul className="space-y-1 text-zinc-800 dark:text-zinc-200">
                <li>
                  <strong>{previewState.recipientCount ?? "—"}</strong> will receive email
                </li>
                {(previewState.skippedNoEmail ?? 0) > 0 ? (
                  <li className="text-zinc-600 dark:text-zinc-400">
                    {previewState.skippedNoEmail} skipped (no valid email)
                  </li>
                ) : null}
                {(previewState.duplicateEmailsCollapsed ?? 0) > 0 ? (
                  <li className="text-zinc-600 dark:text-zinc-400">
                    {previewState.duplicateEmailsCollapsed} duplicate email(s) collapsed to one send each
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goToStep3}
              disabled={!previewState.recipientCount}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600"
            >
              Next: review
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <form action={createAction} className="flex max-w-xl flex-col gap-4">
          <input type="hidden" name="templateId" value={templateId} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="bodyText" value={bodyText} />
          <input type="hidden" name="incidentTitle" value={incidentTitle} />
          <input type="hidden" name="incidentStatus" value={incidentStatus} />
          <input type="hidden" name="incidentEta" value={incidentEta} />
          {includeInactive ? <input type="hidden" name="includeInactive" value="true" /> : null}

          <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="font-medium text-amber-950 dark:text-amber-100">
              You are about to email <strong>{previewState.recipientCount ?? 0}</strong> customer
              {(previewState.recipientCount ?? 0) === 1 ? "" : "s"}.
            </p>
            <p className="mt-2 text-zinc-700 dark:text-zinc-300">
              Subject: <span className="font-medium">{emailPreview.subject}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {includeInactive ? "Audience: all customers with email." : "Audience: active customers with email only."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="bc-confirm">
              Type <span className="font-mono font-semibold">SEND</span> to confirm
            </label>
            <input
              id="bc-confirm"
              name="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className={fieldClass()}
              placeholder="SEND"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200"
            >
              Back
            </button>
            <SubmitCampaignButton />
          </div>
        </form>
      ) : null}
    </div>
  );
}
