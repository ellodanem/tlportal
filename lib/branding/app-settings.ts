import "server-only";

import { prisma } from "@/lib/db";

const SETTINGS_ID = "default" as const;

/** DB value prefix when the file is on a Vercel Blob store set to private (URLs are not world-readable). */
export const BRANDING_PRIVATE_BLOB_PREFIX = "private:" as const;

export function stripBrandingPrivateBlobPrefix(stored: string): string {
  return stored.startsWith(BRANDING_PRIVATE_BLOB_PREFIX)
    ? stored.slice(BRANDING_PRIVATE_BLOB_PREFIX.length)
    : stored;
}

/** Value for `<img src>` / admin UI: private blobs are served via authenticated API. */
export function brandingLogoDisplayUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith(BRANDING_PRIVATE_BLOB_PREFIX)) return "/api/branding/logo";
  return stored;
}

export async function getBrandingLogoStored(): Promise<string | null> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { logoUrl: true },
  });
  return row?.logoUrl ?? null;
}

export async function getBrandingLogoUrl(): Promise<string | null> {
  const stored = await getBrandingLogoStored();
  return brandingLogoDisplayUrl(stored);
}
