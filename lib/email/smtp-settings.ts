import "server-only";

import { prisma } from "@/lib/db";

const SETTINGS_ID = "default" as const;

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
export async function getSmtpTransportOptions(): Promise<{
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
} | null> {
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

  const opts: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  } = { host, port, secure };

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
