import "server-only";

import { prisma } from "@/lib/db";

const SETTINGS_ID = "default" as const;

export async function isAutoEmailPaidStripeReceiptsEnabled(): Promise<boolean> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { autoEmailPaidStripeReceipts: true },
  });
  return row?.autoEmailPaidStripeReceipts ?? true;
}

export async function getAutoEmailPaidStripeReceiptsForForm(): Promise<boolean> {
  return isAutoEmailPaidStripeReceiptsEnabled();
}
