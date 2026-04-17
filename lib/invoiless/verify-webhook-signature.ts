import { createHmac, timingSafeEqual } from "node:crypto";

const SIG_PREFIX = "sha256=";

/**
 * Invoiless webhook signing: HMAC-SHA256 over the raw request body (UTF-8),
 * base64 digest, header value `sha256=<base64>`.
 * @see https://docs.invoiless.com/docs/webhooks
 */
export function verifyInvoilessWebhookSignature(
  rawBody: string,
  invoilessSignatureHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const s = secret?.trim();
  const header = invoilessSignatureHeader?.trim();
  if (!s || !header) return false;
  const expected = `${SIG_PREFIX}${createHmac("sha256", s).update(rawBody, "utf8").digest("base64")}`;
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(header, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
