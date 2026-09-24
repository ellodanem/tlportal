"use client";

import Link from "next/link";
import { useState } from "react";

import { hasUnresolvedSetupTokens } from "@/lib/admin/setup-commands";

export type DeviceSetupCommandView = {
  id: string;
  name: string;
  body: string;
  note: string | null;
};

function CommandText({ body }: { body: string }) {
  const parts = body.split(/(\{[a-zA-Z0-9_]+\})/g);
  return (
    <code className="block overflow-x-auto whitespace-pre rounded-md bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {parts.map((part, index) =>
        /^\{[a-zA-Z0-9_]+\}$/.test(part) ? (
          <span
            key={index}
            className="rounded bg-amber-100 px-0.5 text-amber-950 dark:bg-amber-950/70 dark:text-amber-100"
          >
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </code>
  );
}

function CopyCommandButton({ value, disabled }: { value: string; disabled: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const label = status === "copied" ? "Copied" : status === "error" ? "Could not copy" : "Copy";

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Replace the placeholder before copying" : label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => {
            setStatus("copied");
            window.setTimeout(() => setStatus("idle"), 2000);
          },
          () => {
            setStatus("error");
            window.setTimeout(() => setStatus("idle"), 2000);
          },
        );
      }}
      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      {label}
    </button>
  );
}

function SetupCommandRow({ command, index }: { command: DeviceSetupCommandView; index: number }) {
  const needsDraft = hasUnresolvedSetupTokens(command.body);
  const [draft, setDraft] = useState(command.body);
  const unresolved = needsDraft && hasUnresolvedSetupTokens(draft);
  const copyValue = needsDraft ? draft : command.body;

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            <span className="mr-2 tabular-nums text-zinc-400">{index + 1}</span>
            {command.name}
          </p>
          {command.note ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{command.note}</p> : null}
        </div>
        <CopyCommandButton value={copyValue} disabled={unresolved || copyValue.trim() === ""} />
      </div>
      <div className="mt-3">
        {needsDraft ? (
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label={`${command.name} command`}
            className={`w-full rounded-md border bg-white px-3 py-2 font-mono text-sm text-zinc-900 shadow-sm outline-none focus:ring-2 dark:bg-zinc-950 dark:text-zinc-50 ${
              unresolved
                ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500/30"
                : "border-zinc-300 focus:border-emerald-500 focus:ring-emerald-500/30 dark:border-zinc-700"
            }`}
          />
        ) : (
          <CommandText body={command.body} />
        )}
      </div>
    </li>
  );
}

export function DeviceSetupCommands({
  modelName,
  modelId,
  commands,
}: {
  modelName: string;
  modelId: string;
  commands: DeviceSetupCommandView[];
}) {
  if (commands.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Setup commands</h2>
        <Link
          href={`/admin/device-models/${modelId}/edit#setup-commands`}
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Edit commands
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {modelName} · {commands.length} {commands.length === 1 ? "command" : "commands"}
      </p>
      <ol className="mt-4 flex flex-col gap-3">
        {commands.map((command, index) => (
          <SetupCommandRow key={command.id} command={command} index={index} />
        ))}
      </ol>
    </section>
  );
}
