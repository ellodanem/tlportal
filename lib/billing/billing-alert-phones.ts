import "server-only";

import { prisma } from "@/lib/db";
import { toSmsAddress } from "@/lib/twilio/phone";

const SETTINGS_ID = "default" as const;

/** Split stored textarea into raw phone strings (deduped, order preserved). */
export function parseBillingAlertPhonesRaw(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.replace(/\D/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Normalize to Twilio SMS `to` addresses (`+…`). */
export function normalizeBillingAlertSmsAddresses(raw: string | null | undefined): string[] {
  const parsed = parseBillingAlertPhonesRaw(raw);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parsed) {
    const sms = toSmsAddress(p);
    if (!sms || seen.has(sms)) continue;
    seen.add(sms);
    out.push(sms);
  }
  return out;
}

export async function getBillingAlertPhonesForForm(): Promise<string> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { billingAlertPhones: true },
  });
  return row?.billingAlertPhones?.trim() ?? "";
}

export async function getBillingAlertSmsRecipients(): Promise<string[]> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { billingAlertPhones: true },
  });
  return normalizeBillingAlertSmsAddresses(row?.billingAlertPhones);
}
