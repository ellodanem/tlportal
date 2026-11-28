import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("SMTP transport options include send timeouts", async () => {
  const [settings, sendMail] = await Promise.all([
    read("lib/email/smtp-settings.ts"),
    read("lib/email/send-mail.ts"),
  ]);
  assert.match(settings, /SMTP_CONNECTION_TIMEOUT_MS = 8_000/);
  assert.match(settings, /SMTP_GREETING_TIMEOUT_MS = 8_000/);
  assert.match(settings, /SMTP_SOCKET_TIMEOUT_MS = 8_000/);
  assert.match(settings, /connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS/);
  assert.match(sendMail, /withSmtpSendTimeouts\(config\.transport\)/);
});

test("Twilio WhatsApp sends use a request timeout and do not auto-retry", async () => {
  const send = await read("lib/twilio/whatsapp-send.ts");
  assert.match(send, /TWILIO_SEND_TIMEOUT_MS = 8_000/);
  assert.match(send, /timeout: TWILIO_SEND_TIMEOUT_MS/);
  assert.match(send, /autoRetry: false/);
});

test("outstanding invoice reminder returns before revalidating pages", async () => {
  const actions = await read("app/admin/customers/billing-actions.ts");
  assert.match(actions, /import \{ after \} from "next\/server"/);
  const body = functionBody(actions, "sendOutstandingInvoiceReminderAction");
  assert.match(body, /after\(\(\) => \{/);
  assert.match(body, /revalidatePath\(`\/admin\/subscriptions\/customers\/\$\{customerId\}\/billing`\)/);
  assert.match(body, /customerWorkspacePath\(customerId, "messages"\)/);
  const afterIdx = body.indexOf("after(() => {");
  const billingRevalidateIdx = body.indexOf(
    "revalidatePath(`/admin/subscriptions/customers/${customerId}/billing`)",
  );
  const returnOkIdx = body.indexOf("ok: true");
  assert.ok(afterIdx >= 0 && billingRevalidateIdx > afterIdx, "billing revalidate stays inside after()");
  assert.ok(returnOkIdx > afterIdx, "success is returned after scheduling after()");
});

test("outstanding invoice reminder dialog can close while sending and refreshes after success", async () => {
  const panel = await read("components/admin/outstanding-invoice-reminder-panel.tsx");
  assert.match(panel, /STALL_WARNING_MS = 8_000/);
  assert.match(panel, /You can close this window/);
  assert.match(panel, /Check Messages before sending again/);
  const onSentIdx = panel.indexOf("onSent?.()");
  const refreshIdx = panel.indexOf("router.refresh()");
  assert.ok(onSentIdx >= 0 && refreshIdx > onSentIdx, "close the dialog before refreshing the page");
});
