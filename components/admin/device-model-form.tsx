"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createDeviceModel,
  updateDeviceModel,
} from "@/app/admin/device-models/actions";
import {
  deviceModelFormInitialState,
  type DeviceModelFormActionState,
} from "@/app/admin/device-models/device-model-form-state";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

function moneyString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "toString" in v) {
    const s = (v as { toString: () => string }).toString();
    const n = Number(s);
    return Number.isNaN(n) ? s : n.toFixed(2);
  }
  return String(v);
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function DeviceModelCreateForm(
  props: {
    /** Called when user cancels in the modal. */
    onRequestClose?: () => void;
    embedded?: "page" | "modal";
  } = {},
) {
  const { onRequestClose, embedded = "page" } = props;
  const [state, formAction] = useActionState(createDeviceModel, deviceModelFormInitialState);
  return (
    <DeviceModelFormInner
      formAction={formAction}
      state={state}
      submitLabel="Create model"
      onRequestClose={onRequestClose}
      embedded={embedded}
      defaults={{
        name: "",
        manufacturer: "",
        category: "",
        description: "",
        retailPrice: "0",
        costPrice: "",
        isActive: true,
      }}
    />
  );
}

export function DeviceModelEditForm({
  id,
  defaults,
}: {
  id: string;
  defaults: {
    name: string;
    manufacturer: string | null;
    category: string | null;
    description: string | null;
    retailPrice: unknown;
    costPrice: unknown;
    isActive: boolean;
  };
}) {
  const [state, formAction] = useActionState(updateDeviceModel, deviceModelFormInitialState);
  return (
    <DeviceModelFormInner
      formAction={formAction}
      state={state}
      submitLabel="Save changes"
      embedded="page"
      modelId={id}
      defaults={{
        name: defaults.name,
        manufacturer: defaults.manufacturer ?? "",
        category: defaults.category ?? "",
        description: defaults.description ?? "",
        retailPrice: moneyString(defaults.retailPrice),
        costPrice: moneyString(defaults.costPrice),
        isActive: defaults.isActive,
      }}
    />
  );
}

function DeviceModelFormInner({
  formAction,
  state,
  submitLabel,
  modelId,
  onRequestClose,
  embedded = "page",
  defaults,
}: {
  formAction: (payload: FormData) => void;
  state: DeviceModelFormActionState;
  submitLabel: string;
  modelId?: string;
  onRequestClose?: () => void;
  embedded?: "page" | "modal";
  defaults: {
    name: string;
    manufacturer: string;
    category: string;
    description: string;
    retailPrice: string;
    costPrice: string;
    isActive: boolean;
  };
}) {
  return (
    <form action={formAction} className={`space-y-4 ${embedded === "modal" ? "max-w-none" : "max-w-xl"}`}>
      {modelId ? <input type="hidden" name="id" value={modelId} /> : null}
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {state.error}
        </p>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="dm-name">
          Model name <span className="text-red-600">*</span>
        </label>
        <input
          id="dm-name"
          name="name"
          required
          defaultValue={defaults.name}
          className={inputClass}
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="dm-mfg">
            Manufacturer
          </label>
          <input
            id="dm-mfg"
            name="manufacturer"
            defaultValue={defaults.manufacturer}
            className={inputClass}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="dm-cat">
            Category
          </label>
          <input id="dm-cat" name="category" defaultValue={defaults.category} className={inputClass} autoComplete="off" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="dm-desc">
          Description
        </label>
        <textarea
          id="dm-desc"
          name="description"
          rows={3}
          defaultValue={defaults.description}
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="dm-retail">
            Retail price <span className="text-red-600">*</span>
          </label>
          <input
            id="dm-retail"
            name="retailPrice"
            type="text"
            inputMode="decimal"
            required
            defaultValue={defaults.retailPrice}
            className={inputClass}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300" htmlFor="dm-cost">
            Cost price
          </label>
          <input
            id="dm-cost"
            name="costPrice"
            type="text"
            inputMode="decimal"
            defaultValue={defaults.costPrice}
            className={inputClass}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="dm-active"
          name="isActive"
          type="checkbox"
          defaultChecked={defaults.isActive}
          className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
        />
        <label htmlFor="dm-active" className="text-sm text-zinc-700 dark:text-zinc-300">
          Active (shown in Register device)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <SubmitButton label={submitLabel} />
        {embedded === "modal" && onRequestClose ? (
          <button
            type="button"
            onClick={onRequestClose}
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Cancel
          </button>
        ) : (
          <Link
            href="/admin/device-models"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
