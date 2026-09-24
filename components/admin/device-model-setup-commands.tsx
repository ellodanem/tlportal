"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  createSetupCommand,
  deleteSetupCommand,
  moveSetupCommand,
  updateSetupCommand,
} from "@/app/admin/device-models/setup-command-actions";
import {
  setupCommandInitialState,
  type SetupCommandActionState,
} from "@/app/admin/device-models/setup-command-form-state";

export type SetupCommandEditorRow = {
  id: string;
  name: string;
  body: string;
  note: string | null;
};

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

function FieldError({ state }: { state: SetupCommandActionState }) {
  if (!state.error) {
    return null;
  }
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
      {state.error}
    </p>
  );
}

function PrimarySubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function SecondarySubmit({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={secondaryButtonClass}>
      {pending ? "Working…" : label}
    </button>
  );
}

function CommandEditorRow({
  command,
  index,
  total,
}: {
  command: SetupCommandEditorRow;
  index: number;
  total: number;
}) {
  const [saveState, saveAction] = useActionState(updateSetupCommand, setupCommandInitialState);
  const [moveState, moveAction] = useActionState(moveSetupCommand, setupCommandInitialState);
  const [deleteState, deleteAction] = useActionState(deleteSetupCommand, setupCommandInitialState);
  const error = saveState.error ?? moveState.error ?? deleteState.error;

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <form action={saveAction} className="space-y-3">
        <input type="hidden" name="id" value={command.id} />
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{index + 1}</p>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor={`cmd-name-${command.id}`}>
            Name
          </label>
          <input
            id={`cmd-name-${command.id}`}
            name="name"
            required
            defaultValue={command.name}
            className={inputClass}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor={`cmd-body-${command.id}`}>
            Command
          </label>
          <textarea
            id={`cmd-body-${command.id}`}
            name="body"
            required
            rows={2}
            defaultValue={command.body}
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor={`cmd-note-${command.id}`}>
            Note
          </label>
          <input
            id={`cmd-note-${command.id}`}
            name="note"
            defaultValue={command.note ?? ""}
            className={inputClass}
            autoComplete="off"
          />
        </div>
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}
        <PrimarySubmit label="Save" />
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={moveAction}>
          <input type="hidden" name="id" value={command.id} />
          <input type="hidden" name="direction" value="up" />
          <SecondarySubmit label="Move up" disabled={index === 0} />
        </form>
        <form action={moveAction}>
          <input type="hidden" name="id" value={command.id} />
          <input type="hidden" name="direction" value="down" />
          <SecondarySubmit label="Move down" disabled={index === total - 1} />
        </form>
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!window.confirm(`Delete “${command.name}”?`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={command.id} />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 shadow-sm transition hover:bg-red-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
          >
            Delete
          </button>
        </form>
      </div>
    </li>
  );
}

function AddCommandForm({ deviceModelId }: { deviceModelId: string }) {
  const [state, formAction] = useActionState(createSetupCommand, setupCommandInitialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.okId) {
      formRef.current?.reset();
    }
  }, [state.okId]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
      <input type="hidden" name="deviceModelId" value={deviceModelId} />
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Add command</p>
      <FieldError state={state} />
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="new-cmd-name">
          Name
        </label>
        <input id="new-cmd-name" name="name" required className={inputClass} autoComplete="off" />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="new-cmd-body">
          Command
        </label>
        <textarea id="new-cmd-body" name="body" required rows={2} spellCheck={false} className={`${inputClass} font-mono`} />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="new-cmd-note">
          Note
        </label>
        <input id="new-cmd-note" name="note" className={inputClass} autoComplete="off" />
      </div>
      <PrimarySubmit label="Add command" />
    </form>
  );
}

export function DeviceModelSetupCommands({
  deviceModelId,
  commands,
}: {
  deviceModelId: string;
  commands: SetupCommandEditorRow[];
}) {
  return (
    <section id="setup-commands" className="scroll-mt-6 max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Setup commands</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Ordered commands for setting up this model. They show on Manage device with a Copy button. Use{" "}
          <span className="font-mono text-xs">{"{apn}"}</span>, <span className="font-mono text-xs">{"{imei}"}</span>,{" "}
          <span className="font-mono text-xs">{"{serial}"}</span>, or <span className="font-mono text-xs">{"{msisdn}"}</span>{" "}
          as placeholders. IMEI, serial, and SIM number fill in on the device. {"{apn}"} stays until someone replaces it.
        </p>
      </div>
      {commands.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {commands.map((command, index) => (
            <CommandEditorRow key={command.id} command={command} index={index} total={commands.length} />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No setup commands yet.</p>
      )}
      <AddCommandForm deviceModelId={deviceModelId} />
    </section>
  );
}
