import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWhatsAppPhone, toWhatsAppAddress } from "@/lib/twilio/phone";

test("normalizes Saint Lucia and international WhatsApp numbers to E.164", () => {
  assert.equal(normalizeWhatsAppPhone("555-1234"), "+17585551234");
  assert.equal(normalizeWhatsAppPhone("(758) 555-1234"), "+17585551234");
  assert.equal(normalizeWhatsAppPhone("whatsapp:+44 20 7946 0018"), "+442079460018");
  assert.equal(toWhatsAppAddress("+1 758 555 1234"), "whatsapp:+17585551234");
});

test("rejects malformed or ambiguous WhatsApp numbers", () => {
  assert.equal(normalizeWhatsAppPhone("1234"), null);
  assert.equal(normalizeWhatsAppPhone("75855512345"), null);
  assert.equal(normalizeWhatsAppPhone("call me maybe"), null);
  assert.equal(normalizeWhatsAppPhone("+00012345678"), null);
});
