export const FEEDBACK_BODY_MAX = 4000;
export const FEEDBACK_NAME_MAX = 80;
export const FEEDBACK_CONTACT_MAX = 120;
export const FEEDBACK_ADMIN_NOTE_MAX = 2000;

export function parseFeedbackContact(raw: string): { email: string | null; phone: string | null } {
  const t = raw.trim().slice(0, FEEDBACK_CONTACT_MAX);
  if (!t) return { email: null, phone: null };
  if (t.includes("@")) return { email: t, phone: null };
  return { email: null, phone: t };
}

export function parseFeedbackRating(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number.parseInt(raw, 10);
  if (n < 1 || n > 5) return null;
  return n;
}
