const SAINT_LUCIA_COUNTRY_CODE = "1758";

/**
 * Normalize a customer mobile number to E.164 for storage and Twilio.
 *
 * The portal is Saint Lucia based, so a seven-digit local number is treated as
 * a Saint Lucia number. Other international numbers must include `+`; this
 * avoids silently guessing a country for a number which cannot receive the
 * intended WhatsApp template.
 */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  let raw = phone?.trim() ?? "";
  if (!raw) return null;
  raw = raw.replace(/^whatsapp:/i, "").trim();

  const hasPlus = raw.startsWith("+");
  // Parentheses, spaces, periods and hyphens are presentation characters only.
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let e164Digits: string;
  if (hasPlus) {
    e164Digits = digits;
  } else if (digits.length === 7) {
    e164Digits = `${SAINT_LUCIA_COUNTRY_CODE}${digits}`;
  } else if (digits.length === 10) {
    // North American national format, including Saint Lucia without the +1.
    e164Digits = `1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    e164Digits = digits;
  } else {
    return null;
  }

  // E.164 is at most 15 digits and never begins with zero.
  if (e164Digits.length < 8 || e164Digits.length > 15 || e164Digits.startsWith("0")) return null;
  return `+${e164Digits}`;
}

/** Normalize Customer.phone to Twilio WhatsApp `to` address. */
export function toWhatsAppAddress(phone: string | null | undefined): string | null {
  const e164 = normalizeWhatsAppPhone(phone);
  return e164 ? `whatsapp:${e164}` : null;
}

/** E.164 for Twilio SMS (`+…`). Accepts numbers stored for WhatsApp or plain phones. */
export function toSmsAddress(phone: string | null | undefined): string | null {
  return normalizeWhatsAppPhone(phone);
}
