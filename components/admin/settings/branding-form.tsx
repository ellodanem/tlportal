"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type BrandingFormState,
  removeBrandingLogo,
  uploadBrandingLogo,
} from "@/app/admin/settings/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400"
    >
      {pending ? "Uploading…" : "Upload logo"}
    </button>
  );
}

function RemoveSubmitButton({ hasLogo }: { hasLogo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !hasLogo}
      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
    >
      {pending ? "Removing…" : "Remove logo"}
    </button>
  );
}

const initialState: BrandingFormState = {};

export function BrandingForm({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const [state, formAction] = useActionState(uploadBrandingLogo, initialState);

  return (
    <div className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-white via-white to-sky-50/40 p-6 shadow-sm dark:border-sky-900/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-sky-950/25">
      <div className="flex flex-col gap-2 border-b border-sky-100/80 pb-4 dark:border-sky-900/50">
        <h2 className="text-lg font-semibold text-sky-950 dark:text-sky-100">Branding</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Upload your Track Lucia logo for the admin sidebar. PNG or SVG with a transparent background works best. Max
          2&nbsp;MB.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-h-[88px] min-w-0 flex-1 flex-col justify-center rounded-xl border border-dashed border-sky-200/80 bg-white/80 px-4 py-4 dark:border-sky-800/60 dark:bg-zinc-950/40">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-800/80 dark:text-sky-300/90">Preview</p>
          {initialLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic admin-uploaded asset
            <img
              src={initialLogoUrl}
              alt="Current logo"
              className="mt-2 h-12 w-auto max-w-full object-contain object-left"
            />
          ) : (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              No custom logo yet — sidebar shows the default title until you upload one.
            </p>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 lg:max-w-md">
          <form action={formAction} className="flex flex-col gap-3">
            <div>
              <label htmlFor="logo" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Logo file
              </label>
              <input
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="mt-1 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sky-900 hover:file:bg-sky-200 dark:text-zinc-400 dark:file:bg-sky-950 dark:file:text-sky-100 dark:hover:file:bg-sky-900"
              />
            </div>
            {state.error ? (
              <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
                {state.error}
              </p>
            ) : null}
            {state.ok ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">Logo saved. It may take a moment to refresh.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <SubmitButton />
            </div>
          </form>

          <form action={removeBrandingLogo} className="pt-1">
            <RemoveSubmitButton hasLogo={Boolean(initialLogoUrl)} />
          </form>
        </div>
      </div>
    </div>
  );
}
