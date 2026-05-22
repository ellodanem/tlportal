import "server-only";

import { getSmtpMailFrom } from "@/lib/email/smtp-settings";

import type { BroadcastMergeValues } from "./merge-fields";
import { BROADCAST_MERGE_SAMPLE } from "./merge-fields";

export async function getBroadcastSupportEmail(): Promise<string> {
  const from = await getSmtpMailFrom();
  if (from?.address) return from.address;
  const env = process.env.BROADCAST_SUPPORT_EMAIL?.trim() || process.env.SUPPORT_EMAIL?.trim();
  if (env) return env;
  return BROADCAST_MERGE_SAMPLE.support_email;
}

export function getBroadcastPortalUrl(): string {
  const env = process.env.BROADCAST_PORTAL_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return BROADCAST_MERGE_SAMPLE.portal_url;
}

export async function getBroadcastSampleMergeValues(): Promise<BroadcastMergeValues> {
  return {
    ...BROADCAST_MERGE_SAMPLE,
    support_email: await getBroadcastSupportEmail(),
    portal_url: getBroadcastPortalUrl(),
  };
}
