import "server-only";

import { prisma } from "@/lib/db";

const SETTINGS_ID = "default" as const;

export async function getBrandingLogoUrl(): Promise<string | null> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { logoUrl: true },
  });
  return row?.logoUrl ?? null;
}
