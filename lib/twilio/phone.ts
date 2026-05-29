/** Normalize Customer.phone to Twilio WhatsApp `to` address. */
export function toWhatsAppAddress(phone: string | null | undefined): string | null {
  const raw = phone?.trim();
  if (!raw) return null;

  if (raw.toLowerCase().startsWith("whatsapp:")) {
    return raw;
  }

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;

  let national = digits;
  if (!hasPlus) {
    if (digits.length === 10) {
      national = `1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      national = digits;
    } else {
      national = digits;
    }
  } else {
    national = digits;
  }

  return `whatsapp:+${national}`;
}

/** E.164 for Twilio SMS (`+…`). Accepts numbers stored for WhatsApp or plain phones. */
export function toSmsAddress(phone: string | null | undefined): string | null {
  const wa = toWhatsAppAddress(phone);
  if (!wa) return null;
  return wa.replace(/^whatsapp:/i, "");
}
