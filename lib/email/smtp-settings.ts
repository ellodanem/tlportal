import "server-only";

import { prisma } from "@/lib/db";

const SETTINGS_ID = "default" as const;

/** Fail hung SMTP connections before the Vercel function is killed with no response. */
export const SMTP_CONNECTION_TIMEOUT_MS = 8_000;
export const SMTP_GREETING_TIMEOUT_MS = 8_000;
export const SMTP_SOCKET_TIMEOUT_MS = 8_000;

export type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

export function withSmtpSendTimeouts<T extends { host: string; port: number; secure: boolean }>(
  opts: T,
): T & Pick<SmtpTransportOptions, "connectionTimeout" | "greetingTimeout" | "socketTimeout"> {
  return {
    ...opts,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  };
}

/** Values for the admin SMTP form (password is never returned). */
export type SmtpSettingsFormValues = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasStoredPassword: boolean;
  fromEmail: string;
  fromName: string;
};

export async function getSmtpSettingsForForm(): Promise<SmtpSettingsFormValues> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPassword: true,
      smtpFromEmail: true,
      smtpFromName: true,
    },
  });
  return {
    host: row?.smtpHost?.trim() ?? "",
    port: row?.smtpPort ?? 587,
    secure: row?.smtpSecure ?? false,
    user: row?.smtpUser?.trim() ?? "",
    hasStoredPassword: Boolean(row?.smtpPassword?.trim()),
    fromEmail: row?.smtpFromEmail?.trim() ?? "",
    fromName: row?.smtpFromName?.trim() ?? "",
  };
}

/** Options for `nodemailer.createTransport` when SMTP is configured. */
export async function getSmtpTransportOptions(): Promise<SmtpTransportOptions | null> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPassword: true,
    },
  });
  if (!row) return null;
  const host = row.smtpHost?.trim();
  if (!host) return null;

  const pass = process.env.SMTP_PASSWORD?.trim() || row.smtpPassword?.trim() || "";
  const user = row.smtpUser?.trim() ?? "";
  const port = row.smtpPort ?? 587;
  const secure = row.smtpSecure ?? false;

  const opts: SmtpTransportOptions = withSmtpSendTimeouts({ host, port, secure });

  if (user || pass) {
    opts.auth = { user, pass };
  }
  return opts;
}

/** Default From header when sending mail. */
export async function getSmtpMailFrom(): Promise<{ address: string; name?: string } | null> {
  const row = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { smtpFromEmail: true, smtpFromName: true },
  });
  const address = row?.smtpFromEmail?.trim();
  if (!address) return null;
  const name = row?.smtpFromName?.trim();
  return name ? { address, name } : { address };
}
