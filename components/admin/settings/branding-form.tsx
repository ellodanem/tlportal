"use client";

import type { BrandingLogoSize } from "@prisma/client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  type BrandingFormState,
  type BrandingLogoSizeFormState,
  removeBrandingLogo,
  updateBrandingLogoSize,
  uploadBrandingLogo,
} from "@/app/admin/settings/actions";
import { BRANDING_LOGO_SIZE_OPTIONS, brandingLogoHeightClass } from "@/lib/branding/logo-size";

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

function LogoSizeSaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-sky-950 shadow-sm transition hover:bg-sky-50 disabled:opacity-60 dark:border-sky-800 dark:bg-zinc-900 dark:text-sky-100 dark:hover:bg-sky-950/60"
    >
      {pending ? "Saving…" : "Save logo size"}
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

const initialUploadState: BrandingFormState = {};
const initialSizeState: BrandingLogoSizeFormState = {};

function sizeLabel(s: BrandingLogoSize): string {
  return s.toUpperCase();
}

export function BrandingForm({
  initialLogoUrl,
  initialLogoSize,
}: {
  initialLogoUrl: string | null;
  initialLogoSize: BrandingLogoSize;
}) {
  const [uploadState, uploadAction] = useActionState(uploadBrandingLogo, initialUploadState);
  const [sizeState, sizeAction] = useActionState(updateBrandingLogoSize, initialSizeState);
  const [logoSize, setLogoSize] = useState<BrandingLogoSize>(initialLogoSize);

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
              className={`mt-2 w-auto max-w-full object-contain object-left ${brandingLogoHeightClass(logoSize, false)}`}
            />
          ) : (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              No custom logo yet — sidebar shows the default title until you upload one.
            </p>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-col gap-5 lg:max-w-md">
          <div>
            <p id="branding-logo-size-label" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Logo size (sidebar)
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Applies when the sidebar is expanded; collapsed mode scales down slightly.
            </p>
            <div
              role="radiogroup"
              aria-labelledby="branding-logo-size-label"
              className="mt-3 flex flex-wrap gap-2"
            >
              {BRANDING_LOGO_SIZE_OPTIONS.map((s) => (
                <label
                  key={s}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    logoSize === s
                      ? "border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="logoSizeUi"
                    checked={logoSize === s}
                    onChange={() => setLogoSize(s)}
                    className="sr-only"
                  />
                  {sizeLabel(s)}
                </label>
              ))}
            </div>
            <form action={sizeAction} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="logoSize" value={logoSize} />
              <div className="flex flex-wrap items-center gap-2">
                <LogoSizeSaveButton />
              </div>
              {sizeState.error ? (
                <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
                  {sizeState.error}
                </p>
              ) : null}
              {sizeState.ok ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Logo size saved.</p>
              ) : null}
            </form>
          </div>

          <form action={uploadAction} className="flex flex-col gap-3 border-t border-sky-100/80 pt-5 dark:border-sky-900/50">
            <input type="hidden" name="logoSize" value={logoSize} />
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
            {uploadState.error ? (
              <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
                {uploadState.error}
              </p>
            ) : null}
            {uploadState.ok ? (
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
