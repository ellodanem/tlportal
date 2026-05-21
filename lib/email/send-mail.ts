import "server-only";

import nodemailer from "nodemailer";

import { getSmtpMailFrom, getSmtpTransportOptions } from "./smtp-settings";

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

  const to = input.to.trim();
  if (!to) {
    return { ok: false, error: "Recipient email is required." };
  }

  try {
    const transporter = nodemailer.createTransport(transportOpts);
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
