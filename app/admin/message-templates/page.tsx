import { customerDisplayName } from "@/lib/admin/customer-display";
import {
  buildMessageTemplateCatalog,
  type MessageTemplateCatalogEntry,
  type MessageTemplateChannel,
} from "@/lib/communications/message-template-catalog";
import { prisma } from "@/lib/db";
import { QuickEmailComposer, type QuickEmailCustomer } from "@/components/admin/quick-email-composer";

const CHANNEL_LABEL: Record<MessageTemplateChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

const CHANNEL_ORDER: MessageTemplateChannel[] = ["email", "whatsapp", "sms"];

function channelBadgeClass(channel: MessageTemplateChannel): string {
  switch (channel) {
    case "whatsapp":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200";
    case "sms":
      return "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200";
    default:
      return "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200";
  }
}

function TemplateCard({ entry }: { entry: MessageTemplateCatalogEntry }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${channelBadgeClass(entry.channel)}`}>
          {CHANNEL_LABEL[entry.channel]}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {entry.audience}
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
            entry.config.ok
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
              : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
          }`}
        >
          {entry.config.ok ? "✓ " : "✗ "}
          {entry.config.label}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{entry.name}</h3>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{entry.trigger}</p>

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Variables</p>
        <ul className="mt-1 space-y-0.5">
          {entry.variables.map((v) => (
            <li key={v.token} className="text-xs text-zinc-600 dark:text-zinc-400">
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{v.token}</code> — {v.meaning}
            </li>
          ))}
        </ul>
      </div>

      {entry.preview ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-300">
            Preview
          </summary>
          {entry.preview.subject ? (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Subject:</span> {entry.preview.subject}
            </p>
          ) : null}
          <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 font-sans text-xs leading-relaxed text-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
            {entry.preview.body}
          </pre>
        </details>
      ) : (
        <p className="mt-3 text-xs italic text-zinc-500 dark:text-zinc-400">
          {entry.manageNote ?? "Copy managed externally."}
          {entry.envVar ? (
            <>
              {" "}
              <code className="rounded bg-zinc-100 px-1 not-italic dark:bg-zinc-800">{entry.envVar}</code>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

export default async function MessageTemplatesPage() {
  const [catalog, customerRows] = await Promise.all([
    buildMessageTemplateCatalog(),
    prisma.customer.findMany({
      where: { email: { not: null } },
      select: { id: true, email: true, company: true, firstName: true, lastName: true },
      orderBy: [{ company: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
      take: 2000,
    }),
  ]);

  const customers: QuickEmailCustomer[] = customerRows
    .filter((c) => c.email?.trim())
    .map((c) => ({ id: c.id, name: customerDisplayName(c), email: c.email!.trim() }));

  const smtpReady = catalog.some((e) => e.channel === "email" && e.config.ok);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Message templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Reference for every automated message the portal sends, plus a quick way to email an individual customer.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Quick email</h2>
        <p className="mt-1 mb-4 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Send a one-off email to a single customer. WhatsApp one-offs use approved templates only and are coming next.
        </p>
        <QuickEmailComposer customers={customers} smtpReady={smtpReady} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">System message catalog</h2>
        {CHANNEL_ORDER.map((channel) => {
          const entries = catalog.filter((e) => e.channel === channel);
          if (entries.length === 0) return null;
          return (
            <div key={channel} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {CHANNEL_LABEL[channel]}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <TemplateCard key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
