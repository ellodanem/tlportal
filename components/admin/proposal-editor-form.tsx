"use client";

import type {
  ProposalLineCategory,
  ProposalStatus,
  ProposalVisualKind,
  ProposalVisualLayout,
} from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteProposal, saveProposal } from "@/app/admin/proposals/actions";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

const sectionTitleClass =
  "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

const CATEGORY_OPTIONS: { value: ProposalLineCategory; label: string }[] = [
  { value: "hardware", label: "Hardware" },
  { value: "subscription", label: "Subscription" },
  { value: "installation", label: "Installation" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
];

export type CustomerOption = { id: string; label: string };

export type ProposalEditorLine = {
  key: string;
  category: ProposalLineCategory;
  description: string;
  quantity: number;
  unitLabel: string;
  unitPrice: number;
};

export type TimelineStepDraft = { title: string; detail: string };

export type ProposalEditorVisual = {
  key: string;
  title: string;
  caption: string;
  imageUrl: string;
  placeholderHint: string;
  imageAlt: string;
  kind: ProposalVisualKind;
  layout: ProposalVisualLayout;
  timelineSteps: TimelineStepDraft[];
};

export type ProposalEditorInitial = {
  id: string;
  status: ProposalStatus;
  title: string;
  customerId: string | null;
  clientLabel: string | null;
  clientCompany: string | null;
  clientContactName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  executiveSummary: string | null;
  includedFeatures: string | null;
  assumptionsText: string | null;
  nextStepsText: string | null;
  termsText: string | null;
  pricingFootnote: string | null;
  validityDays: number;
  currencyCode: string;
  salesContactName: string | null;
  salesContactTitle: string | null;
  salesContactEmail: string | null;
  salesContactPhone: string | null;
  lineItems: ProposalEditorLine[];
  visuals: ProposalEditorVisual[];
};

function emptyLine(): ProposalEditorLine {
  return {
    key: crypto.randomUUID(),
    category: "other",
    description: "",
    quantity: 1,
    unitLabel: "",
    unitPrice: 0,
  };
}

function defaultTimelineSteps(): TimelineStepDraft[] {
  return [
    { title: "Order", detail: "" },
    { title: "Install", detail: "" },
    { title: "Go live", detail: "" },
  ];
}

function emptyVisual(): ProposalEditorVisual {
  return {
    key: crypto.randomUUID(),
    title: "",
    caption: "",
    imageUrl: "",
    placeholderHint: "",
    imageAlt: "",
    kind: "media",
    layout: "full_width",
    timelineSteps: defaultTimelineSteps(),
  };
}

export function ProposalEditorForm({
  initial,
  customerOptions,
}: {
  initial: ProposalEditorInitial;
  customerOptions: CustomerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<ProposalStatus>(initial.status);
  const [title, setTitle] = useState(initial.title);
  const [customerId, setCustomerId] = useState(initial.customerId ?? "");
  const [clientLabel, setClientLabel] = useState(initial.clientLabel ?? "");
  const [clientCompany, setClientCompany] = useState(initial.clientCompany ?? "");
  const [clientContactName, setClientContactName] = useState(initial.clientContactName ?? "");
  const [clientEmail, setClientEmail] = useState(initial.clientEmail ?? "");
  const [clientPhone, setClientPhone] = useState(initial.clientPhone ?? "");
  const [clientAddress, setClientAddress] = useState(initial.clientAddress ?? "");
  const [executiveSummary, setExecutiveSummary] = useState(initial.executiveSummary ?? "");
  const [includedFeatures, setIncludedFeatures] = useState(initial.includedFeatures ?? "");
  const [assumptionsText, setAssumptionsText] = useState(initial.assumptionsText ?? "");
  const [nextStepsText, setNextStepsText] = useState(initial.nextStepsText ?? "");
  const [termsText, setTermsText] = useState(initial.termsText ?? "");
  const [pricingFootnote, setPricingFootnote] = useState(initial.pricingFootnote ?? "");
  const [validityDays, setValidityDays] = useState(String(initial.validityDays));
  const [currencyCode, setCurrencyCode] = useState(initial.currencyCode);
  const [salesContactName, setSalesContactName] = useState(initial.salesContactName ?? "");
  const [salesContactTitle, setSalesContactTitle] = useState(initial.salesContactTitle ?? "");
  const [salesContactEmail, setSalesContactEmail] = useState(initial.salesContactEmail ?? "");
  const [salesContactPhone, setSalesContactPhone] = useState(initial.salesContactPhone ?? "");

  const [lineItems, setLineItems] = useState<ProposalEditorLine[]>(
    initial.lineItems.length ? initial.lineItems : [emptyLine()],
  );
  const [visuals, setVisuals] = useState<ProposalEditorVisual[]>(
    initial.visuals.length ? initial.visuals : [emptyVisual()],
  );

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("proposalId", initial.id);
    fd.set("title", title);
    fd.set("status", status);
    fd.set("customerId", customerId);
    fd.set("clientLabel", clientLabel);
    fd.set("clientCompany", clientCompany);
    fd.set("clientContactName", clientContactName);
    fd.set("clientEmail", clientEmail);
    fd.set("clientPhone", clientPhone);
    fd.set("clientAddress", clientAddress);
    fd.set("executiveSummary", executiveSummary);
    fd.set("includedFeatures", includedFeatures);
    fd.set("assumptionsText", assumptionsText);
    fd.set("nextStepsText", nextStepsText);
    fd.set("termsText", termsText);
    fd.set("pricingFootnote", pricingFootnote);
    fd.set("validityDays", validityDays);
    fd.set("currencyCode", currencyCode);
    fd.set("salesContactName", salesContactName);
    fd.set("salesContactTitle", salesContactTitle);
    fd.set("salesContactEmail", salesContactEmail);
    fd.set("salesContactPhone", salesContactPhone);

    const linesPayload = lineItems.map((row) => ({
      category: row.category,
      description: row.description,
      quantity: row.quantity,
      unitLabel: row.unitLabel,
      unitPrice: row.unitPrice,
    }));
    fd.set("lineItemsJson", JSON.stringify(linesPayload));

    const visualsPayload = visuals.map((row) => ({
      title: row.title,
      caption: row.caption,
      imageUrl: row.imageUrl,
      placeholderHint: row.placeholderHint,
      imageAlt: row.imageAlt,
      kind: row.kind,
      layout: row.layout,
      timelineSteps: row.timelineSteps,
    }));
    fd.set("visualsJson", JSON.stringify(visualsPayload));

    startTransition(async () => {
      const res = await saveProposal(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => submit()}
            disabled={pending}
            className="inline-flex justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {pending ? "Saving…" : "Save draft"}
          </button>
          <a
            href={`/api/admin/proposals/${initial.id}/pdf`}
            className="inline-flex justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Download PDF
          </a>
        </div>
        <form action={deleteProposal} className="flex items-center gap-2">
          <input type="hidden" name="proposalId" value={initial.id} />
          <button
            type="submit"
            className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
            onClick={(e) => {
              if (!window.confirm("Delete this proposal permanently?")) {
                e.preventDefault();
              }
            }}
          >
            Delete proposal
          </button>
        </form>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2">
        <div className="md:col-span-2">
          <p className={sectionTitleClass}>Basics</p>
          <label className="mt-2 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Title
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Status
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as ProposalStatus)}
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Linked customer (optional)
          <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— None —</option>
            {customerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <p className="md:col-span-2 text-xs text-zinc-500 dark:text-zinc-400">
          PDF uses the client fields below. If they are blank and a customer is linked, we fall back to the customer
          record when generating the PDF.
        </p>
      </section>

      <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2">
        <p className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Client (cover / PDF)
        </p>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Display name
          <input className={inputClass} value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Company
          <input className={inputClass} value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Contact name
          <input
            className={inputClass}
            value={clientContactName}
            onChange={(e) => setClientContactName(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Email
          <input className={inputClass} value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Phone
          <input className={inputClass} value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
        </label>
        <label className="md:col-span-2 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Address (multi-line)
          <textarea
            className={`${inputClass} min-h-[72px]`}
            value={clientAddress}
            onChange={(e) => setClientAddress(e.target.value)}
          />
        </label>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className={sectionTitleClass}>Narrative</p>
        <label className="mt-2 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Executive summary
          <textarea
            className={`${inputClass} min-h-[100px]`}
            value={executiveSummary}
            onChange={(e) => setExecutiveSummary(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Included capabilities (one bullet per line)
          <textarea
            className={`${inputClass} min-h-[120px]`}
            value={includedFeatures}
            onChange={(e) => setIncludedFeatures(e.target.value)}
          />
        </label>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className={sectionTitleClass}>Line items</p>
          <button
            type="button"
            onClick={() => setLineItems((rows) => [...rows, emptyLine()])}
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            + Add line
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-4">
          {lineItems.map((row, idx) => (
            <div
              key={row.key}
              className="grid gap-3 rounded-md border border-zinc-100 p-3 dark:border-zinc-800 sm:grid-cols-2 lg:grid-cols-12"
            >
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 lg:col-span-2">
                Category
                <select
                  className={inputClass}
                  value={row.category}
                  onChange={(e) => {
                    const v = e.target.value as ProposalLineCategory;
                    setLineItems((prev) => prev.map((r, i) => (i === idx ? { ...r, category: v } : r)));
                  }}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 lg:col-span-5">
                Description
                <input
                  className={inputClass}
                  value={row.description}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLineItems((prev) => prev.map((r, i) => (i === idx ? { ...r, description: v } : r)));
                  }}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 lg:col-span-1">
                Qty
                <input
                  type="number"
                  min={0}
                  step="any"
                  className={inputClass}
                  value={row.quantity}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setLineItems((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, quantity: Number.isFinite(v) ? v : 0 } : r)),
                    );
                  }}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 lg:col-span-2">
                Unit label
                <input
                  className={inputClass}
                  value={row.unitLabel}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLineItems((prev) => prev.map((r, i) => (i === idx ? { ...r, unitLabel: v } : r)));
                  }}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 lg:col-span-2">
                Unit price
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputClass}
                  value={row.unitPrice}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setLineItems((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, unitPrice: Number.isFinite(v) ? v : 0 } : r)),
                    );
                  }}
                />
              </label>
              <div className="flex items-end lg:col-span-12">
                <button
                  type="button"
                  className="text-sm text-red-700 hover:underline dark:text-red-400"
                  onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={lineItems.length <= 1}
                >
                  Remove line
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Currency code
            <input className={inputClass} value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Validity (days)
            <input className={inputClass} value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
          </label>
        </div>
        <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Pricing footnote (taxes, etc.)
          <textarea
            className={`${inputClass} min-h-[64px]`}
            value={pricingFootnote}
            onChange={(e) => setPricingFootnote(e.target.value)}
          />
        </label>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className={sectionTitleClass}>Visual sections (PDF)</p>
          <button
            type="button"
            onClick={() => setVisuals((rows) => [...rows, emptyVisual()])}
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            + Add visual block
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <strong>Media:</strong> leave image URL empty to use the placeholder hint. <strong>Half width:</strong> two
          consecutive half-width media blocks render side-by-side in the PDF. <strong>Timeline:</strong> diagram strip
          (no image). Paths resolve using{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">NEXT_PUBLIC_APP_URL</code> or{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">APP_ORIGIN</code>.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          {visuals.map((row, idx) => (
            <div key={row.key} className="grid gap-3 rounded-md border border-zinc-100 p-3 dark:border-zinc-800">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Block type
                  <select
                    className={inputClass}
                    value={row.kind}
                    onChange={(e) => {
                      const kind = e.target.value as ProposalVisualKind;
                      setVisuals((prev) =>
                        prev.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                kind,
                                layout: kind === "timeline" ? "full_width" : r.layout,
                                timelineSteps:
                                  kind === "timeline" && r.timelineSteps.length === 0
                                    ? defaultTimelineSteps()
                                    : r.timelineSteps,
                              }
                            : r,
                        ),
                      );
                    }}
                  >
                    <option value="media">Screenshot / image</option>
                    <option value="timeline">Timeline diagram</option>
                  </select>
                </label>
                {row.kind === "media" ? (
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Layout (PDF)
                    <select
                      className={inputClass}
                      value={row.layout}
                      onChange={(e) => {
                        const layout = e.target.value as ProposalVisualLayout;
                        setVisuals((prev) => prev.map((r, i) => (i === idx ? { ...r, layout } : r)));
                      }}
                    >
                      <option value="full_width">Full width</option>
                      <option value="half_width">Half width (pair with next half-width block)</option>
                    </select>
                  </label>
                ) : (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 sm:mt-8">
                    Timeline blocks always use the full content width.
                  </p>
                )}
              </div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Section title
                <input
                  className={inputClass}
                  value={row.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVisuals((prev) => prev.map((r, i) => (i === idx ? { ...r, title: v } : r)));
                  }}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Caption
                <textarea
                  className={`${inputClass} min-h-[56px]`}
                  value={row.caption}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVisuals((prev) => prev.map((r, i) => (i === idx ? { ...r, caption: v } : r)));
                  }}
                />
              </label>
              {row.kind === "media" ? (
                <>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Image URL (optional)
                    <input
                      className={inputClass}
                      value={row.imageUrl}
                      onChange={(e) => {
                        const v = e.target.value;
                        setVisuals((prev) => prev.map((r, i) => (i === idx ? { ...r, imageUrl: v } : r)));
                      }}
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Placeholder hint (when no image)
                    <input
                      className={inputClass}
                      value={row.placeholderHint}
                      onChange={(e) => {
                        const v = e.target.value;
                        setVisuals((prev) => prev.map((r, i) => (i === idx ? { ...r, placeholderHint: v } : r)));
                      }}
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Image description (alt text for PDF)
                    <input
                      className={inputClass}
                      value={row.imageAlt}
                      onChange={(e) => {
                        const v = e.target.value;
                        setVisuals((prev) => prev.map((r, i) => (i === idx ? { ...r, imageAlt: v } : r)));
                      }}
                    />
                  </label>
                </>
              ) : (
                <div className="rounded-md border border-dashed border-zinc-200 p-3 dark:border-zinc-700">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Timeline steps</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {row.timelineSteps.map((step, si) => (
                      <div key={si} className="grid gap-2 sm:grid-cols-2">
                        <input
                          className={inputClass}
                          placeholder="Step title"
                          value={step.title}
                          onChange={(e) => {
                            const v = e.target.value;
                            setVisuals((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      timelineSteps: r.timelineSteps.map((t, j) =>
                                        j === si ? { ...t, title: v } : t,
                                      ),
                                    }
                                  : r,
                              ),
                            );
                          }}
                        />
                        <input
                          className={inputClass}
                          placeholder="Detail (e.g. duration)"
                          value={step.detail}
                          onChange={(e) => {
                            const v = e.target.value;
                            setVisuals((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      timelineSteps: r.timelineSteps.map((t, j) =>
                                        j === si ? { ...t, detail: v } : t,
                                      ),
                                    }
                                  : r,
                              ),
                            );
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      onClick={() =>
                        setVisuals((prev) =>
                          prev.map((r, i) =>
                            i === idx && r.timelineSteps.length < 8
                              ? { ...r, timelineSteps: [...r.timelineSteps, { title: "", detail: "" }] }
                              : r,
                          ),
                        )
                      }
                      disabled={row.timelineSteps.length >= 8}
                    >
                      + Add step
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                      onClick={() =>
                        setVisuals((prev) =>
                          prev.map((r, i) =>
                            i === idx && r.timelineSteps.length > 1
                              ? { ...r, timelineSteps: r.timelineSteps.slice(0, -1) }
                              : r,
                          ),
                        )
                      }
                      disabled={row.timelineSteps.length <= 1}
                    >
                      Remove last step
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                className="text-left text-sm text-red-700 hover:underline dark:text-red-400"
                onClick={() => setVisuals((prev) => prev.filter((_, i) => i !== idx))}
                disabled={visuals.length <= 1}
              >
                Remove block
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className={sectionTitleClass}>Assumptions, next steps, terms</p>
        <label className="mt-2 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Assumptions
          <textarea
            className={`${inputClass} min-h-[72px]`}
            value={assumptionsText}
            onChange={(e) => setAssumptionsText(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Next steps
          <textarea
            className={`${inputClass} min-h-[72px]`}
            value={nextStepsText}
            onChange={(e) => setNextStepsText(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Terms
          <textarea
            className={`${inputClass} min-h-[140px]`}
            value={termsText}
            onChange={(e) => setTermsText(e.target.value)}
          />
          <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
            PDF uses bold subsection titles when you separate blocks with a line containing only{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">---</code> — the first line of each block is
            the heading.
          </span>
        </label>
      </section>

      <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:grid-cols-2">
        <p className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Sales contact (PDF closing)
        </p>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Name
          <input className={inputClass} value={salesContactName} onChange={(e) => setSalesContactName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Title
          <input className={inputClass} value={salesContactTitle} onChange={(e) => setSalesContactTitle(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Email
          <input className={inputClass} value={salesContactEmail} onChange={(e) => setSalesContactEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Phone
          <input className={inputClass} value={salesContactPhone} onChange={(e) => setSalesContactPhone(e.target.value)} />
        </label>
      </section>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <Link href="/admin/proposals" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← All proposals
        </Link>
      </p>
    </div>
  );
}
