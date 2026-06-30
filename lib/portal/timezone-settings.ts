import "server-only";

import { prisma } from "@/lib/db";
import {
  DEFAULT_PORTAL_LOCATION,
  DEFAULT_PORTAL_TIMEZONE,
  isValidPortalTimezone,
} from "@/lib/portal/timezone-options";

const SETTINGS_ID = "default" as const;

export type PortalTimezoneSettings = {
  timezone: string;
  location: string;
};

function envTimezoneOverride(): string | null {
  const v = process.env.BILLING_REMINDER_TIMEZONE?.trim();
  return v || null;
}

/** Effective IANA timezone: env override → AppSettings → St. Lucia default. */
export async function getPortalTimezone(): Promise<string> {
  const env = envTimezoneOverride();
  if (env && isValidPortalTimezone(env)) {
    return env;
  }

  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { businessTimezone: true },
  });
  const stored = row?.businessTimezone?.trim();
  if (stored && isValidPortalTimezone(stored)) {
    return stored;
  }
  return DEFAULT_PORTAL_TIMEZONE;
}

export async function getPortalTimezoneSettingsForForm(): Promise<PortalTimezoneSettings> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { businessTimezone: true, businessLocation: true },
  });

  const timezone =
    row?.businessTimezone?.trim() && isValidPortalTimezone(row.businessTimezone.trim())
      ? row.businessTimezone.trim()
      : DEFAULT_PORTAL_TIMEZONE;

  const location = row?.businessLocation?.trim() || DEFAULT_PORTAL_LOCATION;

  return { timezone, location };
}

export function parsePortalLocationInput(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 120) return null;
  return trimmed;
}

export function parsePortalTimezoneInput(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!isValidPortalTimezone(trimmed)) return null;
  return trimmed;
}
