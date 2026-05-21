import "server-only";

import nodemailer from "nodemailer";

import { getSmtpMailFrom, getSmtpTransportOptions } from "./smtp-settings";

export type SmtpSendConfig = {
  transport: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  };
  from: { address: string; name?: string };
};

export async function sendAppEmailWithConfig(
  config: SmtpSendConfig,
  input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = input.to.trim();
  if (!to) {
    return { ok: false, error: "Recipient email is required." };
  }

  const from = config.from;
  if (!from.address.trim()) {
    return { ok: false, error: "From email is required." };
  }

  try {
    const transporter = nodemailer.createTransport(config.transport);
    await transporter.sendMail({
      from: from.name ? `"${from.name}" <${from.address}>` : from.address,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text.replace(/\n/g, "<br>"),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send email." };
  }
}

export async function sendAppEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const transportOpts = await getSmtpTransportOptions();
  const from = await getSmtpMailFrom();
  if (!transportOpts || !from) {
    return {
      ok: false,
      error: "SMTP is not configured. Set mail settings under Admin → Settings.",
    };
  }

  return sendAppEmailWithConfig({ transport: transportOpts, from }, input);
}
